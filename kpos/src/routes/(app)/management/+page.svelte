<script lang="ts">
    import { i18n } from "$lib/i18n/index.svelte";
    import { Users, Calculator, Clock } from "lucide-svelte";
    const t = i18n.t;

    const managementItems = [
        {
            title: "ບົດບາດ ແລະ ສິດ",
            description: "ຈັດການບົດບາດ ແລະ ສິດເຂົ້າໃຊ້ລະບົບ",
            href: "/management/roles",
            icon: Users,
            color: "bg-purple-50 text-purple-600 dark:bg-purple-900/30 dark:text-purple-400",
        },
        {
            title: "ເຄົາເຕີເງິນ",
            description: "ຈັດການເຄົາເຕີ ແລະ ກະ",
            href: "/management/cashregisters",
            icon: Calculator,
            color: "bg-green-50 text-green-600 dark:bg-green-900/30 dark:text-green-400",
        },
        {
            title: "ກະການເຮັດວຽກ",
            description: "ປະຫວັດການເຂົ້າກະຂອງພະນັກງານ",
            href: "/management/shifts",
            icon: Clock,
            color: "bg-blue-50 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400",
        },
    ];
</script>

<svelte:head>
    <title>ການຈັດການ - KPOS</title>
</svelte:head>

<div class="min-h-screen bg-gray-50 dark:bg-gray-900 p-6">
    <div class="mb-6">
        <h1 class="text-2xl font-bold text-gray-900 dark:text-white">ການຈັດການ</h1>
        <p class="text-gray-500 dark:text-gray-400">ຈັດການລະບົບ ແລະ ສິດເຂົ້າໃຊ້</p>
    </div>

    <div class="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {#each managementItems as item}
            <a
                href={item.href}
                class="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-6 hover:shadow-md dark:hover:shadow-gray-900/50 transition-shadow flex items-start gap-4"
            >
                <div
                    class="w-12 h-12 rounded-lg {item.color} flex items-center justify-center flex-shrink-0"
                >
                    <item.icon class="w-6 h-6" />
                </div>
                <div>
                    <h3 class="font-semibold text-gray-900 dark:text-white">{item.title}</h3>
                    <p class="text-sm text-gray-500 dark:text-gray-400 mt-1">{item.description}</p>
                </div>
            </a>
        {/each}
    </div>
</div>
