<script lang="ts">
    import { t } from "$lib/i18n/index.svelte";
    import { cn } from "$utils";
    import { api } from "$api";
    import { toast } from "svelte-sonner";
    import { onMount } from "svelte";
    import {
        User,
        Mail,
        Phone,
        Lock,
        Camera,
        Save,
        Eye,
        EyeOff,
        Loader2,
        Shield,
        Building2,
        AlertCircle,
        RefreshCw,
    } from "lucide-svelte";

    // State
    let isLoading = $state(true);
    let error = $state<string | null>(null);
    let isSaving = $state(false);
    let showCurrentPassword = $state(false);
    let showNewPassword = $state(false);
    let showConfirmPassword = $state(false);
    let activeTab = $state<"profile" | "security">("profile");

    // Profile form
    let profileData = $state({
        name: "",
        email: "",
        phone: "",
        avatar: "",
        role: "",
        branch: "",
    });

    // Password form
    let passwordData = $state({
        currentPassword: "",
        newPassword: "",
        confirmPassword: "",
    });

    onMount(() => {
        loadProfile();
    });

    async function loadProfile() {
        isLoading = true;
        error = null;
        try {
            const response = await api.get("users/me/profile").json<any>();
            if (response.success && response.data) {
                profileData = {
                    name: response.data.name || "",
                    email: response.data.email || "",
                    phone: response.data.phone || "",
                    avatar: response.data.avatar || "",
                    role: response.data.role || "",
                    branch: response.data.branch?.name || "",
                };
            }
        } catch (err) {
            console.error("Failed to load profile:", err);
            error = t("profile.loadFailed");
            toast.error(t("profile.loadFailed"));
            profileData = {
                name: "",
                email: "",
                phone: "",
                avatar: "",
                role: "",
                branch: "",
            };
        } finally {
            isLoading = false;
        }
    }

    async function saveProfile() {
        isSaving = true;
        try {
            await api.put("users/me/profile", {
                json: {
                    name: profileData.name,
                    phone: profileData.phone,
                }
            }).json();
            toast.success(t("profile.updateSuccess"));
        } catch (error) {
            console.error("Failed to save profile:", error);
            toast.error(t("profile.updateFailed"));
        } finally {
            isSaving = false;
        }
    }

    async function changePassword() {
        if (passwordData.newPassword !== passwordData.confirmPassword) {
            toast.error(t("profile.passwordMismatch"));
            return;
        }

        if (passwordData.newPassword.length < 6) {
            toast.error(t("profile.passwordTooShort"));
            return;
        }

        isSaving = true;
        try {
            await api.put("users/me/password", {
                json: {
                    currentPassword: passwordData.currentPassword,
                    newPassword: passwordData.newPassword,
                }
            }).json();
            toast.success(t("profile.passwordChanged"));
            passwordData = {
                currentPassword: "",
                newPassword: "",
                confirmPassword: "",
            };
        } catch (error) {
            console.error("Failed to change password:", error);
            toast.error(t("profile.passwordChangeFailed"));
        } finally {
            isSaving = false;
        }
    }

    async function uploadAvatar(event: Event) {
        const input = event.target as HTMLInputElement;
        const file = input.files?.[0];
        if (!file) return;

        const formData = new FormData();
        formData.append("avatar", file);

        try {
            const response = await api.post("users/me/avatar", {
                body: formData,
            }).json<any>();
            
            if (response.success) {
                profileData.avatar = response.data.url;
                toast.success(t("profile.avatarUpdated"));
            }
        } catch (error) {
            console.error("Failed to upload avatar:", error);
            toast.error(t("profile.avatarUploadFailed"));
        }
    }
</script>

<svelte:head>
    <title>{t("profile.title")} - KPOS</title>
</svelte:head>

<div class="min-h-screen bg-gray-50 dark:bg-gray-900 p-4 md:p-6">
    <!-- Header -->
    <div class="mb-6">
        <h1 class="text-2xl font-bold text-gray-900 dark:text-white">
            {t("profile.title")}
        </h1>
        <p class="text-sm text-gray-500 dark:text-gray-400 mt-1">
            {t("profile.subtitle")}
        </p>
    </div>

    <div class="max-w-3xl">
        <!-- Tabs -->
        <div class="flex gap-1 mb-6 bg-gray-100 dark:bg-gray-800 p-1 rounded-lg w-fit">
            <button
                onclick={() => (activeTab = "profile")}
                class={cn(
                    "flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-all",
                    activeTab === "profile"
                        ? "bg-white dark:bg-gray-700 text-gray-900 dark:text-white shadow-sm"
                        : "text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white",
                )}
            >
                <User class="w-4 h-4" />
                {t("profile.profileInfo")}
            </button>
            <button
                onclick={() => (activeTab = "security")}
                class={cn(
                    "flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-all",
                    activeTab === "security"
                        ? "bg-white dark:bg-gray-700 text-gray-900 dark:text-white shadow-sm"
                        : "text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white",
                )}
            >
                <Lock class="w-4 h-4" />
                {t("profile.security")}
            </button>
        </div>

        {#if isLoading}
            <div class="flex items-center justify-center py-12">
                <Loader2 class="w-8 h-8 animate-spin text-primary-600 dark:text-primary-400" />
            </div>
        {:else if error}
            <div class="flex flex-col items-center justify-center py-12 bg-white dark:bg-gray-800 rounded-xl shadow-sm">
                <AlertCircle class="w-12 h-12 text-red-500 dark:text-red-400 mb-4" />
                <p class="text-gray-700 dark:text-gray-300 mb-4">{error}</p>
                <button
                    onclick={() => loadProfile()}
                    class="flex items-center gap-2 px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 dark:bg-primary-500 dark:hover:bg-primary-600 transition-colors"
                >
                    <RefreshCw class="w-4 h-4" />
                    {t("common.retry")}
                </button>
            </div>
        {:else}
            <!-- Profile Tab -->
            {#if activeTab === "profile"}
                <div class="bg-white dark:bg-gray-800 rounded-xl shadow-sm">
                    <!-- Avatar Section -->
                    <div class="p-6 border-b border-gray-200 dark:border-gray-700">
                        <div class="flex items-center gap-6">
                            <div class="relative">
                                <div class="w-24 h-24 rounded-full bg-gradient-to-br from-primary-500 to-primary-600 flex items-center justify-center overflow-hidden">
                                    {#if profileData.avatar}
                                        <img src={profileData.avatar} alt="Avatar" class="w-full h-full object-cover" />
                                    {:else}
                                        <span class="text-3xl font-bold text-white">
                                            {profileData.name.charAt(0).toUpperCase()}
                                        </span>
                                    {/if}
                                </div>
                                <label class="absolute bottom-0 right-0 p-2 bg-white dark:bg-gray-700 rounded-full shadow-lg cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-600 transition-colors border border-gray-200 dark:border-gray-600">
                                    <Camera class="w-4 h-4 text-gray-600 dark:text-gray-300" />
                                    <input type="file" accept="image/*" class="hidden" onchange={uploadAvatar} />
                                </label>
                            </div>
                            <div>
                                <h3 class="text-lg font-semibold text-gray-900 dark:text-white">
                                    {profileData.name}
                                </h3>
                                <div class="flex items-center gap-4 mt-1 text-sm text-gray-500 dark:text-gray-400">
                                    <span class="flex items-center gap-1">
                                        <Shield class="w-4 h-4" />
                                        {profileData.role}
                                    </span>
                                    <span class="flex items-center gap-1">
                                        <Building2 class="w-4 h-4" />
                                        {profileData.branch}
                                    </span>
                                </div>
                            </div>
                        </div>
                    </div>

                    <!-- Profile Form -->
                    <form onsubmit={(e) => { e.preventDefault(); saveProfile(); }} class="p-6 space-y-4">
                        <div>
                            <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                                {t("profile.name")}
                            </label>
                            <div class="relative">
                                <User class="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                                <input
                                    type="text"
                                    bind:value={profileData.name}
                                    class="w-full pl-10 pr-4 py-2.5 rounded-xl border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
                                />
                            </div>
                        </div>

                        <div>
                            <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                                {t("profile.email")}
                            </label>
                            <div class="relative">
                                <Mail class="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                                <input
                                    type="email"
                                    bind:value={profileData.email}
                                    disabled
                                    class="w-full pl-10 pr-4 py-2.5 rounded-xl border border-gray-300 dark:border-gray-600 bg-gray-100 dark:bg-gray-600 text-gray-500 dark:text-gray-400 cursor-not-allowed"
                                />
                            </div>
                            <p class="text-xs text-gray-500 dark:text-gray-400 mt-1">
                                {t("profile.emailCannotChange")}
                            </p>
                        </div>

                        <div>
                            <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                                {t("profile.phone")}
                            </label>
                            <div class="relative">
                                <Phone class="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                                <input
                                    type="tel"
                                    bind:value={profileData.phone}
                                    placeholder="020-xxxx-xxxx"
                                    class="w-full pl-10 pr-4 py-2.5 rounded-xl border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
                                />
                            </div>
                        </div>

                        <div class="pt-4">
                            <button
                                type="submit"
                                disabled={isSaving}
                                class="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-primary-600 text-white hover:bg-primary-700 font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                                {#if isSaving}
                                    <Loader2 class="w-4 h-4 animate-spin" />
                                {:else}
                                    <Save class="w-4 h-4" />
                                {/if}
                                {t("common.save")}
                            </button>
                        </div>
                    </form>
                </div>
            {/if}

            <!-- Security Tab -->
            {#if activeTab === "security"}
                <div class="bg-white dark:bg-gray-800 rounded-xl shadow-sm">
                    <div class="p-6 border-b border-gray-200 dark:border-gray-700">
                        <h3 class="text-lg font-semibold text-gray-900 dark:text-white">
                            {t("profile.changePassword")}
                        </h3>
                        <p class="text-sm text-gray-500 dark:text-gray-400 mt-1">
                            {t("profile.changePasswordDesc")}
                        </p>
                    </div>

                    <form onsubmit={(e) => { e.preventDefault(); changePassword(); }} class="p-6 space-y-4">
                        <div>
                            <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                                {t("profile.currentPassword")}
                            </label>
                            <div class="relative">
                                <Lock class="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                                <input
                                    type={showCurrentPassword ? "text" : "password"}
                                    bind:value={passwordData.currentPassword}
                                    class="w-full pl-10 pr-12 py-2.5 rounded-xl border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
                                />
                                <button
                                    type="button"
                                    onclick={() => showCurrentPassword = !showCurrentPassword}
                                    class="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                                >
                                    {#if showCurrentPassword}
                                        <EyeOff class="w-5 h-5" />
                                    {:else}
                                        <Eye class="w-5 h-5" />
                                    {/if}
                                </button>
                            </div>
                        </div>

                        <div>
                            <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                                {t("profile.newPassword")}
                            </label>
                            <div class="relative">
                                <Lock class="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                                <input
                                    type={showNewPassword ? "text" : "password"}
                                    bind:value={passwordData.newPassword}
                                    class="w-full pl-10 pr-12 py-2.5 rounded-xl border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
                                />
                                <button
                                    type="button"
                                    onclick={() => showNewPassword = !showNewPassword}
                                    class="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                                >
                                    {#if showNewPassword}
                                        <EyeOff class="w-5 h-5" />
                                    {:else}
                                        <Eye class="w-5 h-5" />
                                    {/if}
                                </button>
                            </div>
                        </div>

                        <div>
                            <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                                {t("profile.confirmPassword")}
                            </label>
                            <div class="relative">
                                <Lock class="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                                <input
                                    type={showConfirmPassword ? "text" : "password"}
                                    bind:value={passwordData.confirmPassword}
                                    class="w-full pl-10 pr-12 py-2.5 rounded-xl border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
                                />
                                <button
                                    type="button"
                                    onclick={() => showConfirmPassword = !showConfirmPassword}
                                    class="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                                >
                                    {#if showConfirmPassword}
                                        <EyeOff class="w-5 h-5" />
                                    {:else}
                                        <Eye class="w-5 h-5" />
                                    {/if}
                                </button>
                            </div>
                        </div>

                        <div class="pt-4">
                            <button
                                type="submit"
                                disabled={isSaving || !passwordData.currentPassword || !passwordData.newPassword || !passwordData.confirmPassword}
                                class="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-primary-600 text-white hover:bg-primary-700 font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                                {#if isSaving}
                                    <Loader2 class="w-4 h-4 animate-spin" />
                                {/if}
                                {t("profile.updatePassword")}
                            </button>
                        </div>
                    </form>
                </div>
            {/if}
        {/if}
    </div>
</div>