<script lang="ts">
    import { t } from "$lib/i18n/index.svelte";
    import { cn } from "$utils";
    import {
        HelpCircle,
        Book,
        MessageCircle,
        Video,
        FileText,
        ExternalLink,
        Search,
        ChevronDown,
        ChevronRight,
        Phone,
        Mail,
        Globe,
        Keyboard,
    } from "lucide-svelte";

    let searchQuery = $state("");
    let expandedFaq = $state<string | null>(null);
    let activeTab = $state<"faq" | "shortcuts" | "contact">("faq");

    const faqs = [
        {
            id: "1",
            question: "ວິທີເພີ່ມສິນຄ້າໃໝ່?",
            answer: "ໄປທີ່ເມນູ Products > ກົດປຸ່ມ 'ເພີ່ມສິນຄ້າ' > ກອກຂໍ້ມູນສິນຄ້າ > ກົດ 'ບັນທຶກ'",
            category: "products",
        },
        {
            id: "2",
            question: "ວິທີເປີດກະການເຮັດວຽກ?",
            answer: "ໄປທີ່ Management > Shifts > ກົດ 'ເປີດກະ' > ປ້ອນຍອດເງິນເປີດ > ກົດ 'ເລີ່ມ'",
            category: "shifts",
        },
        {
            id: "3",
            question: "ວິທີພິມບາໂຄດ?",
            answer: "ໄປທີ່ Barcode > ເລືອກສິນຄ້າ > ຕັ້ງຄ່າຂະໜາດ > ກົດ 'ພິມ' ຫຼື 'ດາວໂຫຼດ PDF'",
            category: "barcode",
        },
        {
            id: "4",
            question: "ວິທີສ້າງໂປຣໂມຊັ່ນ?",
            answer: "ໄປທີ່ Promotions > ກົດ 'ສ້າງໃໝ່' > ເລືອກປະເພດ > ຕັ້ງຄ່າສ່ວນຫຼຸດ > ກົດ 'ບັນທຶກ'",
            category: "promotions",
        },
        {
            id: "5",
            question: "ວິທີເບິ່ງລາຍງານການຂາຍ?",
            answer: "ໄປທີ່ Reports > ເລືອກ 'ລາຍງານການຂາຍ' > ເລືອກຊ່ວງວັນທີ > ກົດ 'ສ້າງລາຍງານ'",
            category: "reports",
        },
        {
            id: "6",
            question: "ວິທີຈັດການລູກຄ້າ?",
            answer: "ໄປທີ່ Customers > ເບິ່ງລາຍການລູກຄ້າ > ກົດ 'ເພີ່ມ' ເພື່ອສ້າງໃໝ່ ຫຼື ແກ້ໄຂຂໍ້ມູນລູກຄ້າທີ່ມີຢູ່",
            category: "customers",
        },
        {
            id: "7",
            question: "ວິທີປິດກະການເຮັດວຽກ?",
            answer: "ໄປທີ່ Management > Shifts > ເລືອກກະທີ່ຕ້ອງການປິດ > ກົດ 'ປິດກະ' > ນັບເງິນ > ກົດ 'ຢືນຢັນ'",
            category: "shifts",
        },
        {
            id: "8",
            question: "ວິທີຕັ້ງຄ່າໃບບິນ?",
            answer: "ໄປທີ່ Settings > Receipt > ຕັ້ງຄ່າຫົວໃບບິນ, ທ້າຍໃບບິນ, ແລະ ຂໍ້ມູນຮ້ານ > ກົດ 'ບັນທຶກ'",
            category: "settings",
        },
    ];

    const shortcuts = [
        { keys: ["F1"], description: "ເປີດໜ້າຊ່ວຍເຫຼືອ" },
        { keys: ["F2"], description: "ເປີດ POS" },
        { keys: ["F3"], description: "ຄົ້ນຫາສິນຄ້າ" },
        { keys: ["F4"], description: "ເພີ່ມລູກຄ້າ" },
        { keys: ["F5"], description: "ຣີເຟຣຊ" },
        { keys: ["F8"], description: "ພັກການຂາຍ" },
        { keys: ["F9"], description: "ສ່ວນຫຼຸດ" },
        { keys: ["F10"], description: "ຊຳລະເງິນ" },
        { keys: ["F12"], description: "ພິມໃບບິນ" },
        { keys: ["Ctrl", "+"], description: "ເພີ່ມຈຳນວນ" },
        { keys: ["Ctrl", "-"], description: "ຫຼຸດຈຳນວນ" },
        { keys: ["Ctrl", "Del"], description: "ລົບລາຍການ" },
        { keys: ["Esc"], description: "ຍົກເລີກ" },
        { keys: ["Alt", "S"], description: "ບັນທຶກ" },
        { keys: ["Alt", "P"], description: "ພິມ" },
    ];

    const contactInfo = {
        phone: "+856 20 5555 1234",
        email: "support@kpos.la",
        website: "https://kpos.la",
        hours: "Mon-Fri: 8:00 - 18:00, Sat: 8:00 - 12:00",
    };

    let filteredFaqs = $derived(
        faqs.filter(faq => {
            if (!searchQuery) return true;
            const query = searchQuery.toLowerCase();
            return faq.question.toLowerCase().includes(query) ||
                   faq.answer.toLowerCase().includes(query);
        })
    );
</script>

<svelte:head>
    <title>{t("help.title")} - KPOS</title>
</svelte:head>

<div class="min-h-screen bg-gray-50 dark:bg-gray-900 p-4 md:p-6">
    <!-- Header -->
    <div class="text-center mb-8">
        <div class="inline-flex items-center justify-center w-16 h-16 rounded-full bg-primary-100 dark:bg-primary-900/20 mb-4">
            <HelpCircle class="w-8 h-8 text-primary-600" />
        </div>
        <h1 class="text-2xl font-bold text-gray-900 dark:text-white">
            {t("help.title")}
        </h1>
        <p class="text-gray-500 dark:text-gray-400 mt-2 max-w-md mx-auto">
            {t("help.subtitle")}
        </p>
    </div>

    <!-- Search -->
    <div class="max-w-2xl mx-auto mb-8">
        <div class="relative">
            <Search class="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
            <input
                type="text"
                bind:value={searchQuery}
                placeholder={t("help.searchPlaceholder")}
                class="w-full pl-12 pr-4 py-3 rounded-xl border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-primary-500 focus:border-primary-500 shadow-sm"
            />
        </div>
    </div>

    <!-- Quick Links -->
    <div class="grid grid-cols-2 md:grid-cols-4 gap-4 max-w-4xl mx-auto mb-8">
        <a href="/docs" class="flex flex-col items-center gap-2 p-4 bg-white dark:bg-gray-800 rounded-xl shadow-sm hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors">
            <Book class="w-6 h-6 text-blue-500" />
            <span class="text-sm font-medium text-gray-900 dark:text-white">{t("help.documentation")}</span>
        </a>
        <a href="/videos" class="flex flex-col items-center gap-2 p-4 bg-white dark:bg-gray-800 rounded-xl shadow-sm hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors">
            <Video class="w-6 h-6 text-red-500" />
            <span class="text-sm font-medium text-gray-900 dark:text-white">{t("help.videoTutorials")}</span>
        </a>
        <a href="/changelog" class="flex flex-col items-center gap-2 p-4 bg-white dark:bg-gray-800 rounded-xl shadow-sm hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors">
            <FileText class="w-6 h-6 text-green-500" />
            <span class="text-sm font-medium text-gray-900 dark:text-white">{t("help.changelog")}</span>
        </a>
        <button onclick={() => activeTab = "contact"} class="flex flex-col items-center gap-2 p-4 bg-white dark:bg-gray-800 rounded-xl shadow-sm hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors">
            <MessageCircle class="w-6 h-6 text-purple-500" />
            <span class="text-sm font-medium text-gray-900 dark:text-white">{t("help.contactSupport")}</span>
        </button>
    </div>

    <!-- Tabs -->
    <div class="max-w-4xl mx-auto">
        <div class="flex gap-1 mb-6 bg-gray-100 dark:bg-gray-800 p-1 rounded-lg w-fit mx-auto">
            <button
                onclick={() => (activeTab = "faq")}
                class={cn(
                    "flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-all",
                    activeTab === "faq"
                        ? "bg-white dark:bg-gray-700 text-gray-900 dark:text-white shadow-sm"
                        : "text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white",
                )}
            >
                <HelpCircle class="w-4 h-4" />
                FAQ
            </button>
            <button
                onclick={() => (activeTab = "shortcuts")}
                class={cn(
                    "flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-all",
                    activeTab === "shortcuts"
                        ? "bg-white dark:bg-gray-700 text-gray-900 dark:text-white shadow-sm"
                        : "text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white",
                )}
            >
                <Keyboard class="w-4 h-4" />
                {t("help.shortcuts")}
            </button>
            <button
                onclick={() => (activeTab = "contact")}
                class={cn(
                    "flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-all",
                    activeTab === "contact"
                        ? "bg-white dark:bg-gray-700 text-gray-900 dark:text-white shadow-sm"
                        : "text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white",
                )}
            >
                <Phone class="w-4 h-4" />
                {t("help.contact")}
            </button>
        </div>

        <!-- FAQ Tab -->
        {#if activeTab === "faq"}
            <div class="space-y-3">
                {#each filteredFaqs as faq}
                    <div class="bg-white dark:bg-gray-800 rounded-xl shadow-sm overflow-hidden">
                        <button
                            onclick={() => expandedFaq = expandedFaq === faq.id ? null : faq.id}
                            class="w-full flex items-center justify-between p-4 text-left"
                        >
                            <span class="font-medium text-gray-900 dark:text-white">
                                {faq.question}
                            </span>
                            {#if expandedFaq === faq.id}
                                <ChevronDown class="w-5 h-5 text-gray-400" />
                            {:else}
                                <ChevronRight class="w-5 h-5 text-gray-400" />
                            {/if}
                        </button>
                        {#if expandedFaq === faq.id}
                            <div class="px-4 pb-4 text-gray-600 dark:text-gray-400 border-t border-gray-100 dark:border-gray-700 pt-3">
                                {faq.answer}
                            </div>
                        {/if}
                    </div>
                {/each}

                {#if filteredFaqs.length === 0}
                    <div class="text-center py-12 text-gray-500 dark:text-gray-400">
                        <HelpCircle class="w-12 h-12 mx-auto mb-3 opacity-50" />
                        <p>{t("help.noResults")}</p>
                    </div>
                {/if}
            </div>
        {/if}

        <!-- Shortcuts Tab -->
        {#if activeTab === "shortcuts"}
            <div class="bg-white dark:bg-gray-800 rounded-xl shadow-sm overflow-hidden">
                <div class="p-4 border-b border-gray-200 dark:border-gray-700">
                    <h3 class="font-semibold text-gray-900 dark:text-white">{t("help.keyboardShortcuts")}</h3>
                </div>
                <div class="divide-y divide-gray-100 dark:divide-gray-700">
                    {#each shortcuts as shortcut}
                        <div class="flex items-center justify-between p-4">
                            <span class="text-gray-600 dark:text-gray-400">{shortcut.description}</span>
                            <div class="flex gap-1">
                                {#each shortcut.keys as key}
                                    <kbd class="px-2 py-1 text-xs font-semibold bg-gray-100 dark:bg-gray-700 text-gray-800 dark:text-gray-200 rounded border border-gray-300 dark:border-gray-600">
                                        {key}
                                    </kbd>
                                {/each}
                            </div>
                        </div>
                    {/each}
                </div>
            </div>
        {/if}

        <!-- Contact Tab -->
        {#if activeTab === "contact"}
            <div class="bg-white dark:bg-gray-800 rounded-xl shadow-sm overflow-hidden">
                <div class="p-6 text-center border-b border-gray-200 dark:border-gray-700">
                    <div class="inline-flex items-center justify-center w-12 h-12 rounded-full bg-primary-100 dark:bg-primary-900/20 mb-4">
                        <MessageCircle class="w-6 h-6 text-primary-600" />
                    </div>
                    <h3 class="text-lg font-semibold text-gray-900 dark:text-white">{t("help.needHelp")}</h3>
                    <p class="text-gray-500 dark:text-gray-400 mt-1">{t("help.supportTeam")}</p>
                </div>
                <div class="p-6 space-y-4">
                    <a href={`tel:${contactInfo.phone}`} class="flex items-center gap-4 p-4 rounded-xl border border-gray-200 dark:border-gray-700 hover:border-primary-500 transition-colors">
                        <div class="p-3 bg-green-50 dark:bg-green-900/20 rounded-lg">
                            <Phone class="w-5 h-5 text-green-600" />
                        </div>
                        <div>
                            <p class="font-medium text-gray-900 dark:text-white">{t("help.phone")}</p>
                            <p class="text-gray-500 dark:text-gray-400">{contactInfo.phone}</p>
                        </div>
                    </a>
                    <a href={`mailto:${contactInfo.email}`} class="flex items-center gap-4 p-4 rounded-xl border border-gray-200 dark:border-gray-700 hover:border-primary-500 transition-colors">
                        <div class="p-3 bg-blue-50 dark:bg-blue-900/20 rounded-lg">
                            <Mail class="w-5 h-5 text-blue-600" />
                        </div>
                        <div>
                            <p class="font-medium text-gray-900 dark:text-white">{t("help.email")}</p>
                            <p class="text-gray-500 dark:text-gray-400">{contactInfo.email}</p>
                        </div>
                    </a>
                    <a href={contactInfo.website} target="_blank" class="flex items-center gap-4 p-4 rounded-xl border border-gray-200 dark:border-gray-700 hover:border-primary-500 transition-colors">
                        <div class="p-3 bg-purple-50 dark:bg-purple-900/20 rounded-lg">
                            <Globe class="w-5 h-5 text-purple-600" />
                        </div>
                        <div>
                            <p class="font-medium text-gray-900 dark:text-white">{t("help.website")}</p>
                            <p class="text-gray-500 dark:text-gray-400">{contactInfo.website}</p>
                        </div>
                        <ExternalLink class="w-4 h-4 text-gray-400 ml-auto" />
                    </a>
                    <div class="pt-4 text-center">
                        <p class="text-sm text-gray-500 dark:text-gray-400">
                            {t("help.officeHours")}: {contactInfo.hours}
                        </p>
                    </div>
                </div>
            </div>
        {/if}
    </div>
</div>
