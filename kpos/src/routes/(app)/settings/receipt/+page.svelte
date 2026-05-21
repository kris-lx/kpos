<script lang="ts">
    import { goto } from "$app/navigation";
    import { onMount } from "svelte";
    import { Receipt, Printer, Building2, ArrowRight, Info } from "lucide-svelte";

    onMount(() => {
        // Auto-redirect to the full receipt designer after a short moment
        // (keeps old links working)
    });
</script>

<svelte:head>
    <title>ຕັ້ງຄ່າໃບບິນ - KPOS</title>
</svelte:head>

<div class="min-h-screen bg-gray-50 dark:bg-gray-900 p-6 flex items-center justify-center">
    <div class="w-full max-w-lg space-y-4">
        <!-- Header -->
        <div class="text-center mb-8">
            <div class="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-gradient-to-br from-primary-500 to-primary-600 text-white shadow-lg mb-3">
                <Receipt class="w-7 h-7" />
            </div>
            <h1 class="text-2xl font-bold text-gray-900 dark:text-white">ຕັ້ງຄ່າໃບບິນ</h1>
            <p class="text-sm text-gray-500 dark:text-gray-400 mt-1">ເລືອກການຕັ້ງຄ່າທີ່ຕ້ອງການ</p>
        </div>

        <!-- Info note -->
        <div class="flex items-start gap-3 p-4 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-xl">
            <Info class="w-5 h-5 text-blue-500 shrink-0 mt-0.5" />
            <p class="text-sm text-blue-700 dark:text-blue-300">
                ການຕັ້ງຄ່າໃບບິນຖືກລວມໄວ້ 2 ສ່ວນ: ຮູບແບບໃບບິນ (Documents) ແລະ ຂໍ້ມູນສາຂາ (Branches)
            </p>
        </div>

        <!-- Option 1: Receipt Designer -->
        <a
            href="/documents/design"
            class="flex items-center gap-4 p-5 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-2xl hover:border-primary-400 dark:hover:border-primary-600 hover:shadow-md transition-all group"
        >
            <div class="w-12 h-12 rounded-xl bg-primary-100 dark:bg-primary-900/30 flex items-center justify-center shrink-0 group-hover:bg-primary-200 dark:group-hover:bg-primary-900/50 transition-colors">
                <Printer class="w-6 h-6 text-primary-600 dark:text-primary-400" />
            </div>
            <div class="flex-1 min-w-0">
                <p class="font-semibold text-gray-900 dark:text-white">ອອກແບບໃບບິນ</p>
                <p class="text-sm text-gray-500 dark:text-gray-400 mt-0.5">
                    ຈັດຮູບແບບໃບບິນ, ເລືອກອົງປະກອບ, ຂະໜາດເຈ້ຍ, ໂຕິໝາຍ
                </p>
            </div>
            <ArrowRight class="w-5 h-5 text-gray-400 group-hover:text-primary-500 transition-colors shrink-0" />
        </a>

        <!-- Option 2: Branch Identity -->
        <a
            href="/branches"
            class="flex items-center gap-4 p-5 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-2xl hover:border-emerald-400 dark:hover:border-emerald-600 hover:shadow-md transition-all group"
        >
            <div class="w-12 h-12 rounded-xl bg-emerald-100 dark:bg-emerald-900/30 flex items-center justify-center shrink-0 group-hover:bg-emerald-200 dark:group-hover:bg-emerald-900/50 transition-colors">
                <Building2 class="w-6 h-6 text-emerald-600 dark:text-emerald-400" />
            </div>
            <div class="flex-1 min-w-0">
                <p class="font-semibold text-gray-900 dark:text-white">ຂໍ້ມູນສາຂາ / ໂລໂກ້</p>
                <p class="text-sm text-gray-500 dark:text-gray-400 mt-0.5">
                    ຊື່ສາຂາ, ທີ່ຢູ່, ເບີໂທ, ເລກພາສີ, ໂລໂກ້ — ຂໍ້ມູນທີ່ປາກົດໃນໃບບິນ
                </p>
            </div>
            <ArrowRight class="w-5 h-5 text-gray-400 group-hover:text-emerald-500 transition-colors shrink-0" />
        </a>
    </div>
</div>
