<script lang="ts">
    import {
        Store,
        FileText,
        Receipt,
        CreditCard,
        Star,
        Printer,
        Monitor,
        Bell,
        Plug,
        Database,
        Hash,
        ChevronRight,
        User,
    } from "lucide-svelte";
    import { t } from "$lib/i18n/index.svelte";

    const groups = [
        {
            titleKey: "settings.groupStore",
            items: [
                { href: "/settings/store", icon: Store, labelKey: "settings.storeInfo", descKey: "settings.storeInfoDesc" },
                { href: "/settings/tax", icon: FileText, labelKey: "settings.tax", descKey: "settings.taxDesc" },
                { href: "/settings/payments", icon: CreditCard, labelKey: "settings.paymentMethods", descKey: "settings.paymentMethodsDesc" },
            ],
        },
        {
            titleKey: "settings.groupDocuments",
            items: [
                { href: "/settings/receipt", icon: Receipt, labelKey: "settings.receipt", descKey: "settings.receiptDesc" },
                { href: "/settings/documents", icon: Hash, labelKey: "settings.documentNumbers", descKey: "settings.documentNumbersDescShort" },
            ],
        },
        {
            titleKey: "settings.groupCustomers",
            items: [
                { href: "/settings/loyalty", icon: Star, labelKey: "settings.loyaltyMembers", descKey: "settings.loyaltyMembersDesc" },
            ],
        },
        {
            titleKey: "settings.groupHardware",
            items: [
                { href: "/settings/printers", icon: Printer, labelKey: "settings.printers", descKey: "settings.printersDesc" },
                { href: "/settings/display", icon: Monitor, labelKey: "settings.display", descKey: "settings.displayDesc" },
            ],
        },
        {
            titleKey: "settings.groupNotifications",
            items: [
                { href: "/settings/notifications", icon: Bell, labelKey: "settings.notifications", descKey: "settings.notificationsDesc" },
                { href: "/settings/integrations", icon: Plug, labelKey: "settings.integrations", descKey: "settings.integrationsDesc" },
            ],
        },
        {
            titleKey: "settings.groupSecurity",
            items: [
                { href: "/settings/profile", icon: User, labelKey: "settings.profile", descKey: "settings.profileDesc" },
                { href: "/settings/backup", icon: Database, labelKey: "settings.backup", descKey: "settings.backupDesc" },
            ],
        },
    ];
</script>

<svelte:head>
    <title>{t("settings.title")} - KPOS</title>
</svelte:head>

<div class="p-6 max-w-5xl">
    <div class="mb-8">
        <h1 class="text-2xl font-bold text-gray-900 dark:text-white">{t("settings.title")}</h1>
        <p class="text-gray-500 dark:text-gray-400 mt-1">{t("settings.subtitle")}</p>
    </div>

    <div class="space-y-8">
        {#each groups as group}
            <div>
                <h2 class="text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider mb-3 px-1">
                    {t(group.titleKey)}
                </h2>
                <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                    {#each group.items as item}
                        <a
                            href={item.href}
                            class="flex items-center gap-4 p-4 bg-white dark:bg-gray-900 rounded-xl border border-gray-100 dark:border-gray-800 hover:border-primary-300 dark:hover:border-primary-700 hover:shadow-sm transition-all group"
                        >
                            <div class="w-10 h-10 rounded-xl bg-primary-50 dark:bg-primary-900/30 flex items-center justify-center shrink-0 group-hover:bg-primary-100 dark:group-hover:bg-primary-900/50 transition-colors">
                                <item.icon class="w-5 h-5 text-primary-600 dark:text-primary-400" />
                            </div>
                            <div class="flex-1 min-w-0">
                                <p class="font-medium text-gray-900 dark:text-white text-sm">{t(item.labelKey)}</p>
                                <p class="text-xs text-gray-500 dark:text-gray-400 truncate">{t(item.descKey)}</p>
                            </div>
                            <ChevronRight class="w-4 h-4 text-gray-300 dark:text-gray-600 group-hover:text-primary-400 transition-colors shrink-0" />
                        </a>
                    {/each}
                </div>
            </div>
        {/each}
    </div>
</div>
