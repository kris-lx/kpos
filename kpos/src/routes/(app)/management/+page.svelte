<script lang="ts">
    import { i18n } from "$lib/i18n/index.svelte";
    import { goto } from "$app/navigation";
    import { api } from "$lib/api";
    import { onMount } from "svelte";
    import { toast } from "svelte-sonner";
    import { auth } from "$stores";
    import { Users, Calculator, Clock, Shield, Store, ChevronRight, Loader2, UserCog, Save, Search, X } from "lucide-svelte";
    const t = i18n.t;

    const managementItems = [
        {
            title: "ບົດບາດ ແລະ ສິດ",
            description: "ຈັດການບົດບາດ ແລະ ສິດເຂົ້າໃຊ້ລະບົບ",
            href: "/management/roles",
            icon: Shield,
            color: "bg-purple-50 text-purple-600 dark:bg-purple-900/30 dark:text-purple-400",
            badge: null as number | null,
        },
        {
            title: "ພະນັກງານ",
            description: "ຈັດການພະນັກງານ ແລະ ກຳນົດສິດ",
            href: "/staff",
            icon: Users,
            color: "bg-blue-50 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400",
            badge: null as number | null,
        },
        {
            title: "ເຄົາເຕີເງິນ",
            description: "ຈັດການເຄົາເຕີ ແລະ ກະ",
            href: "/management/cashregisters",
            icon: Calculator,
            color: "bg-green-50 text-green-600 dark:bg-green-900/30 dark:text-green-400",
            badge: null as number | null,
        },
        {
            title: "ກະການເຮັດວຽກ",
            description: "ປະຫວັດການເຂົ້າກະຂອງພະນັກງານ",
            href: "/management/shifts",
            icon: Clock,
            color: "bg-amber-50 text-amber-600 dark:bg-amber-900/30 dark:text-amber-400",
            badge: null as number | null,
        },
        {
            title: "ຮ້ານ / ສາຂາ",
            description: "ຈັດການຮ້ານ ແລະ ສາຂາ",
            href: "/management/stores",
            icon: Store,
            color: "bg-rose-50 text-rose-600 dark:bg-rose-900/30 dark:text-rose-400",
            badge: null as number | null,
        },
    ];

    // Quick role assignment
    let staffList = $state<any[]>([]);
    let roles = $state<any[]>([]);
    let staffLoading = $state(false);
    let searchQuery = $state("");
    let savingId = $state<string | null>(null);

    let filteredStaff = $derived(
        staffList.filter(s =>
            s.name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
            s.email?.toLowerCase().includes(searchQuery.toLowerCase())
        )
    );

    $effect(() => {
        auth.activeStoreId;
        loadQuickData();
    });

    async function loadQuickData() {
        staffLoading = true;
        try {
            const [staffRes, rolesRes] = await Promise.all([
                api.get("staff?limit=50").json<any>(),
                api.get("roles").json<any>(),
            ]);
            staffList = staffRes.data || [];
            roles = rolesRes.data || [];
        } catch (e) {
            console.error("Failed to load:", e);
        } finally {
            staffLoading = false;
        }
    }

    async function assignRole(staffId: string, roleId: string) {
        savingId = staffId;
        try {
            await api.put(`staff/${staffId}`, { json: { roleId } }).json();
            toast.success("ກຳນົດບົດບາດສຳເລັດ");
            // Update local state
            staffList = staffList.map(s => s.id === staffId ? { ...s, roleId } : s);
        } catch (e) {
            console.error("Failed to assign role:", e);
            toast.error("ກຳນົດບົດບາດບໍ່ສຳເລັດ");
        } finally {
            savingId = null;
        }
    }
</script>

<svelte:head>
    <title>ການຈັດການ - KPOS</title>
</svelte:head>

<div class="min-h-screen bg-gray-50 dark:bg-gray-900 p-6">
    <div class="mb-6">
        <h1 class="text-2xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
            <UserCog class="w-7 h-7 text-primary-600" />
            ການຈັດການ
        </h1>
        <p class="text-gray-500 dark:text-gray-400">ຈັດການລະບົບ, ສິດ ແລະ ພະນັກງານ</p>
    </div>

    <!-- Quick Nav Cards -->
    <div class="grid gap-4 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 mb-8">
        {#each managementItems as item (item.href)}
            <a
                href={item.href}
                class="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-5 hover:shadow-md dark:hover:shadow-gray-900/50 transition-all hover:border-primary-300 dark:hover:border-primary-700 group flex flex-col gap-3"
            >
                <div class="flex items-center justify-between">
                    <div class="w-11 h-11 rounded-xl {item.color} flex items-center justify-center">
                        <item.icon class="w-5 h-5" />
                    </div>
                    <ChevronRight class="w-4 h-4 text-gray-400 group-hover:text-primary-500 transition-colors" />
                </div>
                <div>
                    <h3 class="font-semibold text-gray-900 dark:text-white text-sm">{item.title}</h3>
                    <p class="text-xs text-gray-500 dark:text-gray-400 mt-0.5">{item.description}</p>
                </div>
            </a>
        {/each}
    </div>

    <!-- Quick Role Assignment Panel -->
    <div class="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 shadow-sm">
        <div class="px-6 py-4 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between">
            <div class="flex items-center gap-3">
                <div class="p-2 bg-purple-100 dark:bg-purple-900/50 rounded-lg">
                    <Shield class="w-5 h-5 text-purple-600 dark:text-purple-400" />
                </div>
                <div>
                    <h2 class="font-semibold text-gray-900 dark:text-white">ກຳນົດບົດບາດໃຫ້ພະນັກງານ</h2>
                    <p class="text-xs text-gray-500 dark:text-gray-400">ກຳນົດລະດັບສິດໃຫ້ແຕ່ລະຄົນໂດຍກົງ</p>
                </div>
            </div>
            <a href="/staff" class="text-sm text-primary-600 dark:text-primary-400 hover:underline flex items-center gap-1">
                ຈັດການທັງໝົດ <ChevronRight class="w-4 h-4" />
            </a>
        </div>

        <!-- Search -->
        <div class="px-6 py-3 border-b border-gray-100 dark:border-gray-700">
            <div class="relative max-w-sm">
                <Search class="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                <input
                    type="text"
                    bind:value={searchQuery}
                    placeholder="ຄົ້ນຫາພະນັກງານ..."
                    class="w-full pl-9 pr-4 py-2 text-sm rounded-lg border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white placeholder-gray-400 focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                />
                {#if searchQuery}
                    <button onclick={() => (searchQuery = "")} class="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
                        <X class="w-4 h-4" />
                    </button>
                {/if}
            </div>
        </div>

        {#if staffLoading}
            <div class="flex justify-center py-12">
                <Loader2 class="w-8 h-8 animate-spin text-primary-500" />
            </div>
        {:else if filteredStaff.length === 0}
            <div class="py-12 text-center text-gray-500 dark:text-gray-400">
                <Users class="w-12 h-12 mx-auto mb-3 text-gray-300 dark:text-gray-600" />
                <p>{searchQuery ? "ບໍ່ພົບພະນັກງານ" : "ບໍ່ມີຂໍ້ມູນພະນັກງານ"}</p>
            </div>
        {:else}
            <div class="overflow-x-auto">
                <table class="w-full">
                    <thead class="bg-gray-50 dark:bg-gray-700/50">
                        <tr class="text-left text-xs text-gray-500 dark:text-gray-400 uppercase">
                            <th class="px-6 py-3">ພະນັກງານ</th>
                            <th class="px-6 py-3">ອີເມວ</th>
                            <th class="px-6 py-3">ບົດບາດປັດຈຸບັນ</th>
                            <th class="px-6 py-3">ກຳນົດບົດບາດ</th>
                            <th class="px-6 py-3 text-center">ສິດ</th>
                        </tr>
                    </thead>
                    <tbody class="divide-y divide-gray-100 dark:divide-gray-700">
                        {#each filteredStaff.slice(0, 20) as staff (staff.id)}
                            <tr class="hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors">
                                <td class="px-6 py-3">
                                    <div class="flex items-center gap-3">
                                        <div class="w-8 h-8 rounded-full bg-gradient-to-br from-primary-400 to-primary-600 flex items-center justify-center text-white text-sm font-bold flex-shrink-0">
                                            {(staff.name || staff.email || "?")[0].toUpperCase()}
                                        </div>
                                        <span class="font-medium text-gray-900 dark:text-white text-sm">{staff.name || "-"}</span>
                                    </div>
                                </td>
                                <td class="px-6 py-3 text-sm text-gray-500 dark:text-gray-400">{staff.email}</td>
                                <td class="px-6 py-3">
                                    <span class="px-2 py-1 text-xs rounded-full bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300">
                                        {staff.role?.name || staff.role || "-"}
                                    </span>
                                </td>
                                <td class="px-6 py-3">
                                    <div class="flex items-center gap-2">
                                        <select
                                            value={staff.roleId || ""}
                                            onchange={(e) => assignRole(staff.id, (e.target as HTMLSelectElement).value)}
                                            class="text-sm px-2 py-1.5 rounded-lg border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-primary-500 min-w-32"
                                        >
                                            <option value="">-- ເລືອກ --</option>
                                            {#each roles as role (role.id)}
                                                <option value={role.id}>{role.name}</option>
                                            {/each}
                                        </select>
                                        {#if savingId === staff.id}
                                            <Loader2 class="w-4 h-4 animate-spin text-primary-500" />
                                        {/if}
                                    </div>
                                </td>
                                <td class="px-6 py-3 text-center">
                                    <a
                                        href="/staff/{staff.id}/permissions"
                                        class="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-primary-600 dark:text-primary-400 hover:bg-primary-50 dark:hover:bg-primary-900/30 rounded-lg transition-colors"
                                    >
                                        <Shield class="w-3.5 h-3.5" />
                                        ສິດລະອຽດ
                                    </a>
                                </td>
                            </tr>
                        {/each}
                    </tbody>
                </table>
            </div>
            {#if filteredStaff.length > 20}
                <div class="px-6 py-3 border-t border-gray-100 dark:border-gray-700 text-sm text-gray-500 dark:text-gray-400 text-center">
                    ສະແດງ 20 ຈາກ {filteredStaff.length} ຄົນ — <a href="/staff" class="text-primary-600 dark:text-primary-400 hover:underline">ເບິ່ງທັງໝົດ</a>
                </div>
            {/if}
        {/if}
    </div>
</div>
