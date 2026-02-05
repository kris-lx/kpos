<script lang="ts">
    import { createQuery, createMutation, useQueryClient } from "@tanstack/svelte-query";
    import { api } from "$lib/api";
    import { goto } from "$app/navigation";
    import { onMount } from "svelte";
    import { toast } from "svelte-sonner";
    import { cn } from "$lib/utils";
    import {
        Shield,
        ArrowLeft,
        Loader2,
        Plus,
        Trash2,
        GripVertical,
        Save,
        X,
        ChevronDown,
        ShoppingCart,
        Package,
        BarChart3,
        Utensils,
        Settings,
        Users,
        Building2,
        Store,
        FileText,
        Sparkles
    } from "lucide-svelte";

    import { auth } from "$lib/stores/auth.svelte";

    const queryClient = useQueryClient();

    let canAccess = $state(false);
    onMount(async () => {
        try {
            const user = auth.user;
            if (!user) {
                goto("/login");
                return;
            }
            // ສະເພາະ Super Admin ແລະ Admin ເທົ່ານັ້ນທີ່ຈັດການສິດໄດ້
            if (user.isSuperAdmin || user.role === 'admin') {
                canAccess = true;
            } else {
                toast.error("ທ່ານບໍ່ມີສິດເຂົ້າເຖິງໜ້ານີ້");
                goto("/admin");
            }
        } catch {
            goto("/dashboard");
        }
    });

    const permissionsQuery = createQuery({
        queryKey: ["admin-permissions-manage"],
        queryFn: async () => {
            const response = await api.get("admin/permissions").json<any>();
            return response.data || [];
        }
    });

    const saveMutation = createMutation({
        mutationFn: async (groups: any[]) => {
            return api.post("admin/permissions", { json: { groups } }).json();
        },
        onSuccess: () => {
            toast.success("ບັນທຶກສິດສຳເລັດ");
            queryClient.invalidateQueries({ queryKey: ["admin-permissions"] });
        },
        onError: () => toast.error("ເກີດຂໍ້ຜິດພາດ")
    });

    let groups = $state<any[]>([]);
    let expandedGroups = $state<Record<string, boolean>>({});
    let showAddGroupModal = $state(false);
    let showAddPermissionModal = $state(false);
    let selectedGroupKey = $state("");

    let newGroup = $state({
        key: "",
        label: "",
        icon: "Shield",
        color: "from-gray-500 to-slate-500"
    });

    let newPermission = $state({
        key: "",
        label: ""
    });

    // Load data when query completes
    $effect(() => {
        if ($permissionsQuery.data && groups.length === 0) {
            groups = JSON.parse(JSON.stringify($permissionsQuery.data));
        }
    });

    const iconOptions = [
        { value: "ShoppingCart", label: "ກະຕ່າ", icon: ShoppingCart },
        { value: "Package", label: "ກ່ອງ", icon: Package },
        { value: "BarChart3", label: "ກາຟ", icon: BarChart3 },
        { value: "Utensils", label: "ຊ້ອນສ້ອມ", icon: Utensils },
        { value: "Settings", label: "ຕັ້ງຄ່າ", icon: Settings },
        { value: "Shield", label: "ໄລ່", icon: Shield },
        { value: "Users", label: "ຜູ້ໃຊ້", icon: Users },
        { value: "Building2", label: "ອາຄານ", icon: Building2 },
        { value: "Store", label: "ຮ້ານ", icon: Store },
        { value: "FileText", label: "ເອກະສານ", icon: FileText }
    ];

    const colorOptions = [
        { value: "from-emerald-500 to-green-500", label: "ຂຽວ" },
        { value: "from-blue-500 to-cyan-500", label: "ຟ້າ" },
        { value: "from-amber-500 to-orange-500", label: "ສົ້ມ" },
        { value: "from-violet-500 to-purple-500", label: "ມ່ວງ" },
        { value: "from-pink-500 to-rose-500", label: "ບົວ" },
        { value: "from-gray-500 to-slate-500", label: "ເທົາ" },
        { value: "from-red-500 to-rose-500", label: "ແດງ" },
        { value: "from-teal-500 to-cyan-500", label: "ຟ້າເຂັ້ມ" }
    ];

    const iconMap: Record<string, any> = {
        ShoppingCart, Package, BarChart3, Utensils, Settings, Shield, Users, Building2, Store, FileText
    };

    function getIcon(iconName: string) {
        return iconMap[iconName] || Shield;
    }

    function toggleGroup(key: string) {
        expandedGroups[key] = !expandedGroups[key];
    }

    function addGroup() {
        if (!newGroup.key.trim() || !newGroup.label.trim()) {
            toast.error("ກະລຸນາປ້ອນຂໍ້ມູນໃຫ້ຄົບ");
            return;
        }
        if (groups.find(g => g.key === newGroup.key)) {
            toast.error("ລະຫັດກຸ່ມນີ້ມີແລ້ວ");
            return;
        }
        groups = [...groups, { ...newGroup, permissions: [] }];
        newGroup = { key: "", label: "", icon: "Shield", color: "from-gray-500 to-slate-500" };
        showAddGroupModal = false;
        toast.success("ເພີ່ມກຸ່ມສຳເລັດ");
    }

    function removeGroup(key: string) {
        groups = groups.filter(g => g.key !== key);
        toast.success("ລຶບກຸ່ມສຳເລັດ");
    }

    function openAddPermissionModal(groupKey: string) {
        selectedGroupKey = groupKey;
        newPermission = { key: "", label: "" };
        showAddPermissionModal = true;
    }

    function addPermission() {
        if (!newPermission.key.trim() || !newPermission.label.trim()) {
            toast.error("ກະລຸນາປ້ອນຂໍ້ມູນໃຫ້ຄົບ");
            return;
        }
        const fullKey = `${selectedGroupKey}.${newPermission.key}`;
        const groupIndex = groups.findIndex(g => g.key === selectedGroupKey);
        if (groupIndex >= 0) {
            if (groups[groupIndex].permissions.find((p: any) => p.key === fullKey)) {
                toast.error("ລະຫັດສິດນີ້ມີແລ້ວ");
                return;
            }
            groups[groupIndex].permissions = [
                ...groups[groupIndex].permissions,
                { key: fullKey, label: newPermission.label }
            ];
            groups = [...groups];
        }
        showAddPermissionModal = false;
        toast.success("ເພີ່ມສິດສຳເລັດ");
    }

    function removePermission(groupKey: string, permissionKey: string) {
        const groupIndex = groups.findIndex(g => g.key === groupKey);
        if (groupIndex >= 0) {
            groups[groupIndex].permissions = groups[groupIndex].permissions.filter((p: any) => p.key !== permissionKey);
            groups = [...groups];
        }
        toast.success("ລຶບສິດສຳເລັດ");
    }

    function savePermissions() {
        $saveMutation.mutate(groups);
    }
</script>

<svelte:head>
    <title>ຈັດການສິດ - Super Admin</title>
</svelte:head>

{#if !canAccess}
    <div class="flex items-center justify-center h-screen">
        <Loader2 class="h-12 w-12 animate-spin text-violet-500" />
    </div>
{:else}
    <div class="min-h-screen bg-gradient-to-br from-slate-50 via-white to-slate-100 dark:from-gray-950 dark:via-gray-900 dark:to-gray-950">
        <div class="p-6 lg:p-8 max-w-5xl mx-auto space-y-6">
            <!-- Header -->
            <div class="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
                <div class="flex items-center gap-4">
                    <a href="/admin" class="w-10 h-10 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl flex items-center justify-center text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700 transition-all shadow-sm">
                        <ArrowLeft class="w-5 h-5" />
                    </a>
                    <div class="w-14 h-14 bg-gradient-to-br from-violet-600 to-purple-600 rounded-2xl flex items-center justify-center shadow-xl shadow-violet-500/25">
                        <Shield class="w-7 h-7 text-white" />
                    </div>
                    <div>
                        <h1 class="text-2xl lg:text-3xl font-bold text-gray-900 dark:text-white">ຈັດການສິດ</h1>
                        <p class="text-gray-500 dark:text-gray-400">ກຳນົດ menu ແລະ sub menu ສິດ</p>
                    </div>
                </div>
                <div class="flex gap-3">
                    <button onclick={() => showAddGroupModal = true} class="flex items-center gap-2 px-4 py-2.5 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 font-medium rounded-xl hover:bg-gray-50 dark:hover:bg-gray-700 transition-all">
                        <Plus class="w-5 h-5" />
                        <span>ເພີ່ມກຸ່ມ</span>
                    </button>
                    <button onclick={savePermissions} disabled={$saveMutation.isPending} class="flex items-center gap-2 px-5 py-2.5 bg-gradient-to-r from-violet-600 to-purple-600 hover:from-violet-700 hover:to-purple-700 text-white font-medium rounded-xl shadow-lg shadow-violet-500/30 transition-all hover:scale-105 disabled:opacity-50">
                        {#if $saveMutation.isPending}
                            <Loader2 class="w-5 h-5 animate-spin" />
                        {:else}
                            <Save class="w-5 h-5" />
                        {/if}
                        <span>ບັນທຶກ</span>
                    </button>
                </div>
            </div>

            <!-- Permission Groups -->
            <div class="space-y-4">
                {#if $permissionsQuery.isLoading}
                    <div class="bg-white dark:bg-gray-800/50 rounded-2xl p-12 text-center">
                        <Loader2 class="w-10 h-10 animate-spin mx-auto text-violet-500" />
                        <p class="text-gray-500 dark:text-gray-400 mt-4">ກຳລັງໂຫຼດ...</p>
                    </div>
                {:else}
                    {#each groups as group, groupIndex}
                        {@const GroupIcon = getIcon(group.icon)}
                        {@const isExpanded = expandedGroups[group.key]}
                        <div class="bg-white dark:bg-gray-800/50 backdrop-blur-xl rounded-2xl border border-gray-100 dark:border-gray-700/50 shadow-xl shadow-gray-200/50 dark:shadow-none overflow-hidden">
                            <!-- Group Header -->
                            <div class="flex items-center gap-4 p-4 bg-gray-50 dark:bg-gray-800/50 border-b border-gray-100 dark:border-gray-700">
                                <div class="cursor-grab text-gray-400 hover:text-gray-600 dark:hover:text-gray-300">
                                    <GripVertical class="w-5 h-5" />
                                </div>
                                <div class={cn("w-10 h-10 rounded-xl flex items-center justify-center bg-gradient-to-br", group.color)}>
                                    <GroupIcon class="w-5 h-5 text-white" />
                                </div>
                                <div class="flex-1">
                                    <h3 class="font-semibold text-gray-900 dark:text-white">{group.label}</h3>
                                    <p class="text-sm text-gray-500 dark:text-gray-400">{group.key} • {group.permissions.length} ສິດ</p>
                                </div>
                                <div class="flex items-center gap-2">
                                    <button onclick={() => openAddPermissionModal(group.key)} class="w-9 h-9 bg-emerald-100 dark:bg-emerald-900/30 hover:bg-emerald-200 dark:hover:bg-emerald-900/50 rounded-lg flex items-center justify-center text-emerald-600 dark:text-emerald-400 transition-colors">
                                        <Plus class="w-4 h-4" />
                                    </button>
                                    <button onclick={() => removeGroup(group.key)} class="w-9 h-9 bg-red-100 dark:bg-red-900/30 hover:bg-red-200 dark:hover:bg-red-900/50 rounded-lg flex items-center justify-center text-red-600 dark:text-red-400 transition-colors">
                                        <Trash2 class="w-4 h-4" />
                                    </button>
                                    <button onclick={() => toggleGroup(group.key)} class="w-9 h-9 bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 rounded-lg flex items-center justify-center text-gray-600 dark:text-gray-300 transition-colors">
                                        <ChevronDown class={cn("w-5 h-5 transition-transform", isExpanded && "rotate-180")} />
                                    </button>
                                </div>
                            </div>
                            <!-- Permissions List -->
                            {#if isExpanded}
                                <div class="p-4">
                                    {#if group.permissions.length === 0}
                                        <p class="text-center text-gray-500 dark:text-gray-400 py-4">ບໍ່ມີສິດ</p>
                                    {:else}
                                        <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                                            {#each group.permissions as permission}
                                                <div class="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-700/30 rounded-xl group">
                                                    <div class="flex items-center gap-3">
                                                        <div class="w-2 h-2 bg-emerald-500 rounded-full"></div>
                                                        <div>
                                                            <p class="text-sm font-medium text-gray-900 dark:text-white">{permission.label}</p>
                                                            <p class="text-xs text-gray-500 dark:text-gray-400">{permission.key}</p>
                                                        </div>
                                                    </div>
                                                    <button onclick={() => removePermission(group.key, permission.key)} class="w-7 h-7 bg-red-100 dark:bg-red-900/30 hover:bg-red-200 dark:hover:bg-red-900/50 rounded-lg flex items-center justify-center text-red-600 dark:text-red-400 opacity-0 group-hover:opacity-100 transition-all">
                                                        <Trash2 class="w-3.5 h-3.5" />
                                                    </button>
                                                </div>
                                            {/each}
                                        </div>
                                    {/if}
                                </div>
                            {/if}
                        </div>
                    {/each}

                    {#if groups.length === 0}
                        <div class="bg-white dark:bg-gray-800/50 rounded-2xl p-16 text-center">
                            <div class="w-20 h-20 bg-gray-100 dark:bg-gray-700 rounded-full flex items-center justify-center mx-auto mb-4">
                                <Shield class="w-10 h-10 text-gray-400" />
                            </div>
                            <h3 class="text-xl font-semibold text-gray-900 dark:text-white mb-2">ບໍ່ມີກຸ່ມສິດ</h3>
                            <p class="text-gray-500 dark:text-gray-400 mb-4">ເລີ່ມຕົ້ນໂດຍການເພີ່ມກຸ່ມສິດໃໝ່</p>
                            <button onclick={() => showAddGroupModal = true} class="inline-flex items-center gap-2 px-4 py-2 bg-violet-500 hover:bg-violet-600 text-white font-medium rounded-lg transition-colors">
                                <Plus class="w-4 h-4" />
                                ເພີ່ມກຸ່ມສິດ
                            </button>
                        </div>
                    {/if}
                {/if}
            </div>
        </div>
    </div>

    <!-- Add Group Modal -->
    {#if showAddGroupModal}
        <div class="fixed inset-0 z-50 flex items-center justify-center p-4">
            <div class="absolute inset-0 bg-black/60 backdrop-blur-sm" onclick={() => showAddGroupModal = false}></div>
            <div class="relative bg-white dark:bg-gray-800 rounded-2xl shadow-2xl w-full max-w-md overflow-hidden">
                <div class="bg-gradient-to-r from-violet-600 to-purple-600 p-6 text-white">
                    <button onclick={() => showAddGroupModal = false} class="absolute top-4 right-4 w-8 h-8 bg-white/20 hover:bg-white/30 rounded-lg flex items-center justify-center transition-colors">
                        <X class="w-5 h-5" />
                    </button>
                    <div class="flex items-center gap-3">
                        <Sparkles class="w-8 h-8" />
                        <div>
                            <h3 class="text-xl font-bold">ເພີ່ມກຸ່ມສິດ</h3>
                            <p class="text-sm opacity-90">ສ້າງກຸ່ມສິດໃໝ່ (Menu)</p>
                        </div>
                    </div>
                </div>
                <form onsubmit={(e) => { e.preventDefault(); addGroup(); }} class="p-6 space-y-4">
                    <div>
                        <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">ລະຫັດ (key) *</label>
                        <input type="text" bind:value={newGroup.key} placeholder="ເຊັ່ນ: customers" class="w-full px-4 py-3 bg-gray-50 dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-xl focus:ring-2 focus:ring-violet-500 focus:border-transparent text-gray-900 dark:text-white" />
                    </div>
                    <div>
                        <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">ຊື່ສະແດງ *</label>
                        <input type="text" bind:value={newGroup.label} placeholder="ເຊັ່ນ: ລູກຄ້າ" class="w-full px-4 py-3 bg-gray-50 dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-xl focus:ring-2 focus:ring-violet-500 focus:border-transparent text-gray-900 dark:text-white" />
                    </div>
                    <div>
                        <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">ໄອຄອນ</label>
                        <div class="grid grid-cols-5 gap-2">
                            {#each iconOptions as option}
                                {@const Icon = option.icon}
                                <button type="button" onclick={() => newGroup.icon = option.value} class={cn("w-full aspect-square rounded-xl flex items-center justify-center border-2 transition-all", newGroup.icon === option.value ? "border-violet-500 bg-violet-50 dark:bg-violet-900/30" : "border-gray-200 dark:border-gray-600 hover:border-gray-300")}>
                                    <Icon class={cn("w-5 h-5", newGroup.icon === option.value ? "text-violet-500" : "text-gray-500 dark:text-gray-400")} />
                                </button>
                            {/each}
                        </div>
                    </div>
                    <div>
                        <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">ສີ</label>
                        <div class="grid grid-cols-4 gap-2">
                            {#each colorOptions as option}
                                <button type="button" onclick={() => newGroup.color = option.value} class={cn("w-full h-10 rounded-xl bg-gradient-to-br border-2 transition-all", option.value, newGroup.color === option.value ? "border-gray-900 dark:border-white ring-2 ring-offset-2 ring-violet-500" : "border-transparent")}>
                                </button>
                            {/each}
                        </div>
                    </div>
                    <div class="flex gap-3 pt-4">
                        <button type="button" onclick={() => showAddGroupModal = false} class="flex-1 px-4 py-3 bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 font-medium rounded-xl hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors">ຍົກເລີກ</button>
                        <button type="submit" class="flex-1 px-4 py-3 bg-violet-500 hover:bg-violet-600 text-white font-medium rounded-xl shadow-lg shadow-violet-500/30 transition-all">ເພີ່ມ</button>
                    </div>
                </form>
            </div>
        </div>
    {/if}

    <!-- Add Permission Modal -->
    {#if showAddPermissionModal}
        <div class="fixed inset-0 z-50 flex items-center justify-center p-4">
            <div class="absolute inset-0 bg-black/60 backdrop-blur-sm" onclick={() => showAddPermissionModal = false}></div>
            <div class="relative bg-white dark:bg-gray-800 rounded-2xl shadow-2xl w-full max-w-md overflow-hidden">
                <div class="bg-gradient-to-r from-emerald-600 to-teal-600 p-6 text-white">
                    <button onclick={() => showAddPermissionModal = false} class="absolute top-4 right-4 w-8 h-8 bg-white/20 hover:bg-white/30 rounded-lg flex items-center justify-center transition-colors">
                        <X class="w-5 h-5" />
                    </button>
                    <div class="flex items-center gap-3">
                        <Plus class="w-8 h-8" />
                        <div>
                            <h3 class="text-xl font-bold">ເພີ່ມສິດ</h3>
                            <p class="text-sm opacity-90">ເພີ່ມ sub menu ໃນກຸ່ມ {selectedGroupKey}</p>
                        </div>
                    </div>
                </div>
                <form onsubmit={(e) => { e.preventDefault(); addPermission(); }} class="p-6 space-y-4">
                    <div>
                        <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">ລະຫັດ (key) *</label>
                        <div class="flex">
                            <span class="px-4 py-3 bg-gray-100 dark:bg-gray-600 border border-r-0 border-gray-200 dark:border-gray-600 rounded-l-xl text-gray-500 dark:text-gray-400 text-sm">{selectedGroupKey}.</span>
                            <input type="text" bind:value={newPermission.key} placeholder="view" class="flex-1 px-4 py-3 bg-gray-50 dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-r-xl focus:ring-2 focus:ring-emerald-500 focus:border-transparent text-gray-900 dark:text-white" />
                        </div>
                    </div>
                    <div>
                        <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">ຊື່ສະແດງ *</label>
                        <input type="text" bind:value={newPermission.label} placeholder="ເບິ່ງ" class="w-full px-4 py-3 bg-gray-50 dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-xl focus:ring-2 focus:ring-emerald-500 focus:border-transparent text-gray-900 dark:text-white" />
                    </div>
                    <div class="flex gap-3 pt-4">
                        <button type="button" onclick={() => showAddPermissionModal = false} class="flex-1 px-4 py-3 bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 font-medium rounded-xl hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors">ຍົກເລີກ</button>
                        <button type="submit" class="flex-1 px-4 py-3 bg-emerald-500 hover:bg-emerald-600 text-white font-medium rounded-xl shadow-lg shadow-emerald-500/30 transition-all">ເພີ່ມ</button>
                    </div>
                </form>
            </div>
        </div>
    {/if}
{/if}
