<script lang="ts">
    import { auth, themeStore } from "$stores";
    import { i18n, t } from "$lib/i18n/index.svelte";
    import { goto } from "$app/navigation";
    import { cn } from "$utils";
    import { Eye, EyeOff, Store, Sun, Moon, Globe } from "lucide-svelte";
    import { toast } from "svelte-sonner";

    let email = $state("");
    let password = $state("");
    let showPassword = $state(false);
    let isLoading = $state(false);
    let error = $state("");
    let showLangMenu = $state(false);

    async function handleSubmit(e: SubmitEvent) {
        e.preventDefault();
        error = "";
        isLoading = true;

        try {
            const result = await auth.login(email, password);

            if (result === true) {
                toast.success(t("auth.loginSuccess"));
                goto("/pos");
            } else if (result === 'SERVICE_UNAVAILABLE') {
                error = "Database is not available. Please ensure PostgreSQL is running.";
            } else {
                error = t("auth.loginFailed");
            }
        } catch (err) {
            error = t("auth.loginError");
            console.error(err);
        } finally {
            isLoading = false;
        }
    }
</script>

<svelte:head>
    <title>{t("auth.login")} - {t("app.name")}</title>
</svelte:head>

<div
    class="min-h-screen flex items-center justify-center bg-linear-to-br from-primary-500 to-primary-700 dark:from-gray-900 dark:to-gray-800 p-4"
>
    <!-- Theme and Language Controls -->
    <div class="absolute top-4 right-4 flex items-center gap-2">
        <!-- Language Selector -->
        <div class="relative">
            <button
                type="button"
                onclick={() => (showLangMenu = !showLangMenu)}
                class="p-2 rounded-lg bg-white/20 hover:bg-white/30 text-white transition-colors"
            >
                <Globe class="w-5 h-5" />
            </button>
            {#if showLangMenu}
                <div class="absolute right-0 mt-2 w-40 bg-white dark:bg-gray-800 rounded-xl shadow-lg py-1 z-50">
                    {#each i18n.locales as locale}
                        <button
                            type="button"
                            onclick={() => { i18n.setLocale(locale.code); showLangMenu = false; }}
                            class={cn(
                                "w-full px-4 py-2 text-left text-sm hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors",
                                i18n.locale === locale.code ? "text-primary-600 font-medium" : "text-gray-700 dark:text-gray-300"
                            )}
                        >
                            {locale.nativeName}
                        </button>
                    {/each}
                </div>
            {/if}
        </div>

        <!-- Theme Toggle -->
        <button
            type="button"
            onclick={() => themeStore.toggle()}
            class="p-2 rounded-lg bg-white/20 hover:bg-white/30 text-white transition-colors"
        >
            {#if themeStore.isDark}
                <Sun class="w-5 h-5" />
            {:else}
                <Moon class="w-5 h-5" />
            {/if}
        </button>
    </div>

    <div class="w-full max-w-md">
        <!-- Logo & Title -->
        <div class="text-center mb-8">
            <div
                class="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-white dark:bg-gray-800 shadow-lg mb-4"
            >
                <Store class="w-8 h-8 text-primary-600" />
            </div>
            <h1 class="text-3xl font-bold text-white">{t("app.name")}</h1>
            <p class="text-primary-100 mt-1">{t("app.title")}</p>
        </div>

        <!-- Login Form -->
        <div class="bg-white dark:bg-gray-800 rounded-2xl shadow-xl p-8">
            <h2 class="text-xl font-semibold text-gray-900 dark:text-white mb-6">
                {t("auth.login")}
            </h2>

            {#if error}
                <div
                    class="mb-4 p-4 bg-danger-50 dark:bg-danger-900/20 border border-danger-200 dark:border-danger-800 rounded-xl text-danger-600 dark:text-danger-400 text-sm"
                >
                    {error}
                </div>
            {/if}

            <form onsubmit={handleSubmit} class="space-y-4">
                <!-- Email -->
                <div>
                    <label
                        for="email"
                        class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1"
                    >
                        {t("auth.email")}
                    </label>
                    <input
                        type="email"
                        id="email"
                        bind:value={email}
                        required
                        class={cn(
                            "w-full px-4 py-3 rounded-xl border transition-colors",
                            "bg-white dark:bg-gray-700 text-gray-900 dark:text-white",
                            "border-gray-300 dark:border-gray-600",
                            "focus:ring-2 focus:ring-primary-500 focus:border-primary-500",
                            "placeholder:text-gray-400 dark:placeholder:text-gray-500",
                        )}
                        placeholder="example@email.com"
                    />
                </div>

                <!-- Password -->
                <div>
                    <label
                        for="password"
                        class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1"
                    >
                        {t("auth.password")}
                    </label>
                    <div class="relative">
                        <input
                            type={showPassword ? "text" : "password"}
                            id="password"
                            bind:value={password}
                            required
                            class={cn(
                                "w-full px-4 py-3 pr-12 rounded-xl border transition-colors",
                                "bg-white dark:bg-gray-700 text-gray-900 dark:text-white",
                                "border-gray-300 dark:border-gray-600",
                                "focus:ring-2 focus:ring-primary-500 focus:border-primary-500",
                                "placeholder:text-gray-400 dark:placeholder:text-gray-500",
                            )}
                            placeholder="••••••••"
                        />
                        <button
                            type="button"
                            onclick={() => (showPassword = !showPassword)}
                            class="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
                        >
                            {#if showPassword}
                                <EyeOff class="w-5 h-5" />
                            {:else}
                                <Eye class="w-5 h-5" />
                            {/if}
                        </button>
                    </div>
                </div>

                <!-- Remember & Forgot -->
                <div class="flex items-center justify-between text-sm">
                    <label class="flex items-center gap-2 cursor-pointer">
                        <input
                            type="checkbox"
                            class="rounded border-gray-300 dark:border-gray-600 text-primary-500 focus:ring-primary-500"
                        />
                        <span class="text-gray-600 dark:text-gray-400">{t("auth.remember")}</span>
                    </label>
                    <a
                        href="/forgot-password"
                        class="text-primary-600 hover:text-primary-700 dark:text-primary-400"
                    >
                        {t("auth.forgot")}
                    </a>
                </div>

                <!-- Submit -->
                <button
                    type="submit"
                    disabled={isLoading}
                    class={cn(
                        "w-full py-3 px-4 rounded-xl font-medium text-white",
                        "bg-primary-600 hover:bg-primary-700 transition-colors",
                        "disabled:opacity-50 disabled:cursor-not-allowed",
                        "flex items-center justify-center gap-2",
                    )}
                >
                    {#if isLoading}
                        <div
                            class="animate-spin rounded-full h-5 w-5 border-2 border-white border-t-transparent"
                        ></div>
                        <span>{t("common.loading")}</span>
                    {:else}
                        <span>{t("auth.login")}</span>
                    {/if}
                </button>
                
                <!-- Register Link -->
                <div class="text-center text-sm mt-6">
                    <span class="text-gray-500 dark:text-gray-400">{t("auth.noAccount")}</span>
                    <a href="/register/store" class="text-primary-600 hover:text-primary-700 dark:text-primary-400 font-medium ml-1">
                        {t("auth.registerNow")}
                    </a>
                </div>
            </form>
        </div>

        <!-- Footer -->
        <p class="text-center text-primary-100 text-sm mt-6">
            &copy; 2026 KPOS - Enterprise POS System
        </p>
    </div>
</div>
