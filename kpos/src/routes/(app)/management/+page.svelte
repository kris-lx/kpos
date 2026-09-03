<script lang="ts">
    import { Users, Calculator, Clock, Shield, Store, ChevronRight, UserCog } from "lucide-svelte";

    const managementItems = [
        {
            title: "ບົດບາດຂອງຮ້ານ",
            description: "ຈັດການ Role ຂອງ Tenant; ມອບໃຫ້ user ຢູ່ໜ້າ Staff",
            href: "/staff/roles",
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
            color: "bg-success-50 text-success-600 dark:bg-success-900/30 dark:text-success-400",
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

</div>
