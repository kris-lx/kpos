<!-- ═══════════════════════════════════════════════════════════════════════════
     Platform Branding - Super Admin only. Upload/replace/remove the logo
     shown on the public login page (before any tenant context exists).
     ═══════════════════════════════════════════════════════════════════════════ -->
<script lang="ts">
    import { onMount } from "svelte";
    import { goto } from "$app/navigation";
    import { api } from "$lib/api";
    import { toast } from "svelte-sonner";
    import { t } from "$lib/i18n/index.svelte";
    import { auth, dialogStore } from "$stores";
    import { validateFile, IMAGE_ONLY_FILE_TYPES } from "$utils";
    import { Image, Upload, Trash2, Loader2, ChevronLeft, Store } from "lucide-svelte";

    let canAccess = $state(false);
    let loading = $state(true);
    let uploading = $state(false);
    let removing = $state(false);
    let loginLogo = $state<string | null>(null);

    onMount(async () => {
        if (!auth.user?.isSuperAdmin) {
            toast.error(t("common.accessDenied"));
            goto("/dashboard");
            return;
        }
        canAccess = true;
        await loadBranding();
    });

    async function loadBranding() {
        loading = true;
        try {
            const res = await api.get("admin/public/branding").json<any>();
            loginLogo = res.success ? (res.data?.loginLogo ?? null) : null;
        } catch {
            loginLogo = null;
        } finally {
            loading = false;
        }
    }

    async function handleUpload(event: Event) {
        const input = event.target as HTMLInputElement;
        const file = input.files?.[0];
        if (!file) return;
        if (!(await validateFile(file, { allowedTypes: IMAGE_ONLY_FILE_TYPES }))) { input.value = ""; return; }

        uploading = true;
        try {
            const base64 = await new Promise<string>((resolve, reject) => {
                const reader = new FileReader();
                reader.onload = (e) => resolve(e.target?.result as string);
                reader.onerror = reject;
                reader.readAsDataURL(file);
            });
            const res = await api.post("admin/branding/logo", { json: { image: base64 } }).json<any>();
            if (res.success) {
                loginLogo = res.data.url;
                toast.success(t("settings.logoUploadSuccess"));
            } else {
                toast.error(res.error?.message || t("settings.logoUploadFailed"));
            }
        } catch {
            toast.error(t("settings.logoUploadFailed"));
        } finally {
            uploading = false;
            input.value = "";
        }
    }

    async function handleRemove() {
        if (!(await dialogStore.confirm(t("common.confirmDelete"), { variant: "danger" }))) return;
        removing = true;
        try {
            const res = await api.delete("admin/branding/logo").json<any>();
            if (res.success) {
                loginLogo = null;
                toast.success(t("common.deleted"));
            }
        } catch {
            toast.error(t("common.error"));
        } finally {
            removing = false;
        }
    }
</script>

{#if canAccess}
    <div class="p-4 sm:p-6 max-w-2xl mx-auto space-y-6">
        <div class="flex items-center gap-3">
            <a href="/admin" class="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors">
                <ChevronLeft class="w-5 h-5" />
            </a>
            <div>
                <h1 class="text-xl font-semibold text-gray-900 dark:text-white">{t("admin.brandingTitle")}</h1>
                <p class="text-sm text-gray-500 dark:text-gray-400">{t("admin.brandingDesc")}</p>
            </div>
        </div>

        <div class="bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-800 p-6">
            {#if loading}
                <div class="flex items-center justify-center py-12">
                    <Loader2 class="w-6 h-6 animate-spin text-primary-500" />
                </div>
            {:else}
                <div class="flex flex-col items-center gap-4">
                    <div class="w-24 h-24 rounded-2xl bg-gray-100 dark:bg-gray-800 flex items-center justify-center overflow-hidden border border-gray-200 dark:border-gray-700">
                        {#if loginLogo}
                            <img src={loginLogo} alt="Login logo" class="w-full h-full object-cover" />
                        {:else}
                            <Store class="w-10 h-10 text-gray-400" />
                        {/if}
                    </div>

                    <div class="flex items-center gap-2">
                        <label class="cursor-pointer">
                            <input type="file" accept="image/png,image/jpeg" class="hidden" onchange={handleUpload} disabled={uploading} />
                            <span class="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-primary-600 hover:bg-primary-700 text-white text-sm font-medium transition-colors">
                                {#if uploading}
                                    <Loader2 class="w-4 h-4 animate-spin" />
                                {:else}
                                    <Upload class="w-4 h-4" />
                                {/if}
                                {loginLogo ? t("admin.brandingReplace") : t("admin.brandingUpload")}
                            </span>
                        </label>

                        {#if loginLogo}
                            <button
                                type="button"
                                onclick={handleRemove}
                                disabled={removing}
                                class="inline-flex items-center gap-2 px-4 py-2 rounded-xl border border-danger-200 dark:border-danger-800 text-danger-600 dark:text-danger-400 hover:bg-danger-50 dark:hover:bg-danger-900/20 text-sm font-medium transition-colors disabled:opacity-50"
                            >
                                {#if removing}
                                    <Loader2 class="w-4 h-4 animate-spin" />
                                {:else}
                                    <Trash2 class="w-4 h-4" />
                                {/if}
                                {t("common.delete")}
                            </button>
                        {/if}
                    </div>

                    <p class="text-xs text-gray-400 dark:text-gray-500 flex items-center gap-1">
                        <Image class="w-3 h-3" />
                        PNG/JPG, max 10MB
                    </p>
                </div>
            {/if}
        </div>
    </div>
{/if}
