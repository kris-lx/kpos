<script lang="ts">
    import { api } from "$api";
    import { t } from "$lib/i18n/index.svelte";
    import { toast } from "svelte-sonner";
    import {
        Bell,
        BellOff,
        Check,
        CheckCheck,
        Trash2,
        Loader2,
        AlertCircle,
        ShoppingCart,
        Package,
        Settings,
        Info,
        ChevronLeft,
        ChevronRight,
    } from "lucide-svelte";

    type NotifType = "low_stock" | "sale" | "system" | "info" | string;

    interface Notification {
        id: string;
        type: NotifType;
        title: string;
        message: string;
        isRead: boolean;
        createdAt: string;
        data?: Record<string, unknown>;
    }

    let notifications = $state<Notification[]>([]);
    let totalItems = $state(0);
    let unreadCount = $state(0);
    let isLoading = $state(true);
    let currentPage = $state(1);
    const pageSize = 20;
    let filterTab = $state<"all" | "unread">("all");
    let markingAll = $state(false);

    let totalPages = $derived(Math.ceil(totalItems / pageSize) || 1);

    async function load() {
        isLoading = true;
        try {
            const params = new URLSearchParams({
                page: currentPage.toString(),
                limit: pageSize.toString(),
            });
            if (filterTab === "unread") params.set("unreadOnly", "true");
            const res = await api.get(`settings/user-notifications?${params}`).json<any>();
            notifications = res.data || [];
            totalItems = res.pagination?.total ?? res.meta?.total ?? notifications.length;
            unreadCount = res.meta?.unread ?? res.unread ?? 0;
        } catch {
            toast.error(t("notifications.loadFailed"));
        } finally {
            isLoading = false;
        }
    }

    $effect(() => {
        void filterTab;
        void currentPage;
        load();
    });

    async function markRead(n: Notification) {
        if (n.isRead) return;
        n.isRead = true;
        notifications = [...notifications];
        unreadCount = Math.max(0, unreadCount - 1);
        try {
            await api.put(`settings/user-notifications/${n.id}/read`).json();
        } catch {
            n.isRead = false;
            notifications = [...notifications];
            unreadCount += 1;
        }
    }

    async function markAllRead() {
        markingAll = true;
        try {
            await api.put("settings/user-notifications/mark-all-read").json();
            notifications = notifications.map((n) => ({ ...n, isRead: true }));
            unreadCount = 0;
            toast.success(t("notifications.markAllReadSuccess"));
        } catch {
            toast.error(t("common.actionFailed"));
        } finally {
            markingAll = false;
        }
    }

    async function deleteNotif(id: string) {
        try {
            await api.delete(`settings/user-notifications/${id}`).json();
            const removed = notifications.find((n) => n.id === id);
            notifications = notifications.filter((n) => n.id !== id);
            totalItems = Math.max(0, totalItems - 1);
            if (removed && !removed.isRead) unreadCount = Math.max(0, unreadCount - 1);
        } catch {
            toast.error(t("notifications.deleteFailed"));
        }
    }

    function typeIcon(type: NotifType) {
        if (type === "low_stock" || type === "stock") return Package;
        if (type === "sale" || type === "transaction") return ShoppingCart;
        if (type === "system" || type === "settings") return Settings;
        return Info;
    }

    function typeBg(type: NotifType) {
        if (type === "low_stock" || type === "stock")
            return "bg-warning-100 dark:bg-warning-900/30 text-warning-600 dark:text-warning-400";
        if (type === "sale" || type === "transaction")
            return "bg-success-100 dark:bg-success-900/30 text-success-600 dark:text-success-400";
        if (type === "system")
            return "bg-danger-100 dark:bg-danger-900/30 text-danger-600 dark:text-danger-400";
        return "bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400";
    }

    function relativeTime(iso: string) {
        const diff = Date.now() - new Date(iso).getTime();
        const m = Math.floor(diff / 60000);
        if (m < 1) return t("time.justNow");
        if (m < 60) return t("time.minutesAgo", { count: m });
        const h = Math.floor(m / 60);
        if (h < 24) return t("time.hoursAgo", { count: h });
        const d = Math.floor(h / 24);
        return t("time.daysAgo", { count: d });
    }
</script>

<svelte:head><title>{t("notifications.title")} - KPOS</title></svelte:head>

<div class="min-h-screen bg-gray-50 dark:bg-gray-900 p-4 md:p-6">
    <!-- Header -->
    <div class="flex items-center justify-between mb-6">
        <div>
            <h1 class="text-2xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
                <Bell class="w-6 h-6 text-primary-500" />
                {t("notifications.title")}
                {#if unreadCount > 0}
                    <span class="inline-flex items-center justify-center px-2 py-0.5 rounded-full text-xs font-semibold bg-danger-500 text-white">
                        {unreadCount}
                    </span>
                {/if}
            </h1>
            <p class="text-sm text-gray-500 dark:text-gray-400 mt-0.5">{t("notifications.subtitle")}</p>
        </div>
        {#if unreadCount > 0}
            <button
                onclick={markAllRead}
                disabled={markingAll}
                class="flex items-center gap-2 px-4 py-2 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 rounded-lg text-sm font-medium hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors disabled:opacity-50"
            >
                {#if markingAll}
                    <Loader2 class="w-4 h-4 animate-spin" />
                {:else}
                    <CheckCheck class="w-4 h-4" />
                {/if}
                {t("notifications.markAllRead")}
            </button>
        {/if}
    </div>

    <!-- Filter tabs -->
    <div class="flex gap-1 mb-4 bg-white dark:bg-gray-800 rounded-xl p-1 border border-gray-200 dark:border-gray-700 w-fit">
        {#each [{ key: "all", labelKey: "common.all" }, { key: "unread", labelKey: "notifications.unread" }] as tab}
            <button
                onclick={() => { filterTab = tab.key as "all" | "unread"; currentPage = 1; }}
                class="px-4 py-1.5 rounded-lg text-sm font-medium transition-colors {filterTab === tab.key
                    ? 'bg-primary-600 text-white'
                    : 'text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700'}"
            >
                {t(tab.labelKey)}
                {#if tab.key === "unread" && unreadCount > 0}
                    <span class="ml-1 text-xs opacity-80">({unreadCount})</span>
                {/if}
            </button>
        {/each}
    </div>

    <!-- Notification list -->
    <div class="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 overflow-hidden">
        {#if isLoading}
            <div class="flex items-center justify-center py-16">
                <Loader2 class="w-8 h-8 animate-spin text-primary-500" />
            </div>
        {:else if notifications.length === 0}
            <div class="flex flex-col items-center justify-center py-16 text-gray-400">
                <BellOff class="w-12 h-12 mb-3 opacity-40" />
                <p class="text-sm font-medium">{t("notifications.empty")}</p>
                {#if filterTab === "unread"}
                    <p class="text-xs mt-1 opacity-70">{t("notifications.allRead")}</p>
                {/if}
            </div>
        {:else}
            {#each notifications as notif (notif.id)}
                {@const Icon = typeIcon(notif.type)}
                <!-- svelte-ignore a11y_click_events_have_key_events -->
                <!-- svelte-ignore a11y_no_static_element_interactions -->
                <div
                    onclick={() => markRead(notif)}
                    class="flex items-start gap-3 px-4 py-4 border-b border-gray-100 dark:border-gray-700 last:border-0 cursor-pointer transition-colors {notif.isRead
                        ? 'hover:bg-gray-50 dark:hover:bg-gray-700/50'
                        : 'bg-primary-50/40 dark:bg-primary-900/10 hover:bg-primary-50 dark:hover:bg-primary-900/20'}"
                >
                    <!-- Icon -->
                    <div class="shrink-0 w-9 h-9 rounded-full flex items-center justify-center {typeBg(notif.type)}">
                        <Icon class="w-4 h-4" />
                    </div>

                    <!-- Content -->
                    <div class="flex-1 min-w-0">
                        <div class="flex items-start justify-between gap-2">
                            <p class="text-sm font-medium text-gray-900 dark:text-white {notif.isRead ? 'font-normal text-gray-700 dark:text-gray-300' : ''}">
                                {notif.title}
                            </p>
                            <div class="flex items-center gap-2 shrink-0">
                                <span class="text-xs text-gray-400">{relativeTime(notif.createdAt)}</span>
                                {#if !notif.isRead}
                                    <span class="w-2 h-2 rounded-full bg-primary-500 shrink-0"></span>
                                {/if}
                            </div>
                        </div>
                        <p class="text-xs text-gray-500 dark:text-gray-400 mt-0.5 line-clamp-2">{notif.message}</p>
                    </div>

                    <!-- Delete -->
                    <button
                        onclick={(e) => { e.stopPropagation(); deleteNotif(notif.id); }}
                        class="shrink-0 p-1.5 text-gray-300 dark:text-gray-600 hover:text-danger-500 dark:hover:text-danger-400 hover:bg-danger-50 dark:hover:bg-danger-900/20 rounded-lg transition-colors"
                        title={t("common.delete")}
                    >
                        <Trash2 class="w-3.5 h-3.5" />
                    </button>
                </div>
            {/each}
        {/if}
    </div>

    <!-- Pagination -->
    {#if totalPages > 1}
        <div class="flex items-center justify-between mt-4 text-sm text-gray-500 dark:text-gray-400">
            <span>{totalItems} {t("common.items")}</span>
            <div class="flex items-center gap-1">
                <button
                    onclick={() => currentPage--}
                    disabled={currentPage === 1}
                    class="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                >
                    <ChevronLeft class="w-4 h-4" />
                </button>
                <span class="px-3">{currentPage} / {totalPages}</span>
                <button
                    onclick={() => currentPage++}
                    disabled={currentPage === totalPages}
                    class="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                >
                    <ChevronRight class="w-4 h-4" />
                </button>
            </div>
        </div>
    {/if}
</div>
