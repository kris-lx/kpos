<script lang="ts">
    import { themeStore } from "$stores";
    import { i18n, t } from "$lib/i18n/index.svelte";
    import { cn } from "$utils";
    import { Store, Sun, Moon, Globe, KeyRound, Eye, EyeOff } from "lucide-svelte";
    import { toast } from "svelte-sonner";
    import { api } from "$lib/api";
    import { page } from "$app/stores";
    import { goto } from "$app/navigation";

    let password = $state("");
    let confirmPassword = $state("");
    let showPassword = $state(false);
    let showConfirmPassword = $state(false);
    let isLoading = $state(false);
    let error = $state("");
    let successMessage = $state("");
    let showLangMenu = $state(false);

    const token = $derived($page.url.searchParams.get("token") ?? "");

    async function handleSubmit(e: SubmitEvent) {
        e.preventDefault();
        error = "";

        if (!token) {
            error = "ລິ້ງລີເຊັດລະຫັດຜ່ານບໍ່ຖືກຕ້ອງ ກະລຸນາຂໍລິ້ງໃໝ່";
            return;
        }
        if (password.length < 8) {
            error = "ລະຫັດຜ່ານຕ້ອງມີຢ່າງໜ້ອຍ 8 ຕົວອັກສອນ";
            return;
        }
        if (password !== confirmPassword) {
            error = "ລະຫັດຜ່ານທັງສອງບໍ່ຕົງກັນ";
            return;
        }

        isLoading = true;
        try {
            await api.post("auth/reset-password", { json: { token, password } }).json();
            successMessage = "ລີເຊັດລະຫັດຜ່ານສຳເລັດ! ກຳລັງພາທ່ານໄປໜ້າເຂົ້າສູ່ລະບົບ...";
            toast.success("ລີເຊັດລະຫັດຜ່ານສຳເລັດ");
            setTimeout(() => goto("/login"), 2000);
        } catch (err: any) {
            const msg = err?.response ? await err.response.json().catch(() => null) : null;
            if (msg?.error?.code === "INVALID_TOKEN") {
                error = "ລິ້ງລີເຊັດໝົດອາຍຸແລ້ວ ກະລຸນາຂໍລິ້ງໃໝ່";
            } else {
                error = "ເກີດຂໍ້ຜິດພາດ ກະລຸນາລອງໃໝ່ອີກຄັ້ງ";
            }
            console.error(err);
        } finally {
            isLoading = false;
        }
    }
</script>

<svelte:head>
    <title>ລີເຊັດລະຫັດຜ່ານ - {t("app.name")}</title>
</svelte:head>

<div class="min-h-screen flex items-center justify-center bg-linear-to-br from-primary-500 to-primary-700 dark:from-gray-900 dark:to-gray-800 p-4">
    <!-- Theme and Language Controls -->
    <div class="absolute top-4 right-4 flex items-center gap-2">
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
        <button
            type="button"
            onclick={() => themeStore.toggle()}
            class="p-2 rounded-lg bg-white/20 hover:bg-white/30 text-white transition-colors"
        >
            {#if themeStore.isDark}
                <svg xmlns="http://www.w3.org/2000/svg" class="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364-6.364l-.707.707M6.343 17.657l-.707.707M17.657 17.657l-.707-.707M6.343 6.343l-.707-.707M15 12a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
            {:else}
                <svg xmlns="http://www.w3.org/2000/svg" class="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z" /></svg>
            {/if}
        </button>
    </div>

    <div class="w-full max-w-md">
        <!-- Logo & Title -->
        <div class="text-center mb-8">
            <div class="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-white dark:bg-gray-800 shadow-lg mb-4">
                <Store class="w-8 h-8 text-primary-600" />
            </div>
            <h1 class="text-3xl font-bold text-white">{t("app.name")}</h1>
            <p class="text-primary-100 mt-1">{t("app.title")}</p>
        </div>

        <!-- Reset Password Form -->
        <div class="bg-white dark:bg-gray-800 rounded-2xl shadow-xl p-8 relative overflow-hidden">
            <div class="text-center mb-6">
                <div class="inline-flex items-center justify-center w-12 h-12 rounded-full bg-primary-100 dark:bg-primary-900/30 text-primary-600 dark:text-primary-400 mb-4">
                    <KeyRound class="w-6 h-6" />
                </div>
                <h2 class="text-xl font-semibold text-gray-900 dark:text-white mb-2">
                    ສ້າງລະຫັດຜ່ານໃໝ່
                </h2>
                <p class="text-sm text-gray-500 dark:text-gray-400">
                    ກະລຸນາປ້ອນລະຫັດຜ່ານໃໝ່ຂອງທ່ານ
                </p>
            </div>

            {#if !token}
                <div class="mb-4 p-4 bg-danger-50 dark:bg-danger-900/20 border border-danger-200 dark:border-danger-800 rounded-xl text-danger-600 dark:text-danger-400 text-sm">
                    ລິ້ງລີເຊັດລະຫັດຜ່ານບໍ່ຖືກຕ້ອງ ກະລຸນາ<a href="/forgot-password" class="underline font-medium">ຂໍລິ້ງໃໝ່</a>
                </div>
            {/if}

            {#if error}
                <div class="mb-4 p-4 bg-danger-50 dark:bg-danger-900/20 border border-danger-200 dark:border-danger-800 rounded-xl text-danger-600 dark:text-danger-400 text-sm">
                    {error}
                </div>
            {/if}

            {#if successMessage}
                <div class="mb-4 p-4 bg-success-50 dark:bg-success-900/20 border border-success-200 dark:border-success-800 rounded-xl text-success-600 dark:text-success-400 text-sm text-center">
                    {successMessage}
                </div>
            {/if}

            {#if !successMessage}
                <form onsubmit={handleSubmit} class="space-y-4">
                    <!-- New Password -->
                    <div>
                        <label for="password" class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                            ລະຫັດຜ່ານໃໝ່
                        </label>
                        <div class="relative">
                            <input
                                type={showPassword ? "text" : "password"}
                                id="password"
                                bind:value={password}
                                required
                                minlength={8}
                                disabled={isLoading || !token}
                                class={cn(
                                    "w-full px-4 py-3 pr-12 rounded-xl border transition-colors",
                                    "bg-white dark:bg-gray-700 text-gray-900 dark:text-white",
                                    "border-gray-300 dark:border-gray-600",
                                    "focus:ring-2 focus:ring-primary-500 focus:border-primary-500",
                                    "disabled:opacity-60 disabled:cursor-not-allowed"
                                )}
                                placeholder="ຢ່າງໜ້ອຍ 8 ຕົວອັກສອນ"
                            />
                            <button
                                type="button"
                                onclick={() => (showPassword = !showPassword)}
                                class="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
                            >
                                {#if showPassword}
                                    <EyeOff class="w-5 h-5" />
                                {:else}
                                    <Eye class="w-5 h-5" />
                                {/if}
                            </button>
                        </div>
                    </div>

                    <!-- Confirm Password -->
                    <div>
                        <label for="confirm-password" class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                            ຢືນຢັນລະຫັດຜ່ານໃໝ່
                        </label>
                        <div class="relative">
                            <input
                                type={showConfirmPassword ? "text" : "password"}
                                id="confirm-password"
                                bind:value={confirmPassword}
                                required
                                disabled={isLoading || !token}
                                class={cn(
                                    "w-full px-4 py-3 pr-12 rounded-xl border transition-colors",
                                    "bg-white dark:bg-gray-700 text-gray-900 dark:text-white",
                                    "border-gray-300 dark:border-gray-600",
                                    "focus:ring-2 focus:ring-primary-500 focus:border-primary-500",
                                    "disabled:opacity-60 disabled:cursor-not-allowed"
                                )}
                                placeholder="ຢືນຢັນລະຫັດຜ່ານ"
                            />
                            <button
                                type="button"
                                onclick={() => (showConfirmPassword = !showConfirmPassword)}
                                class="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
                            >
                                {#if showConfirmPassword}
                                    <EyeOff class="w-5 h-5" />
                                {:else}
                                    <Eye class="w-5 h-5" />
                                {/if}
                            </button>
                        </div>
                    </div>

                    <button
                        type="submit"
                        disabled={isLoading || !password || !confirmPassword || !token}
                        class={cn(
                            "w-full py-3 px-4 rounded-xl font-medium text-white mt-2",
                            "bg-primary-600 hover:bg-primary-700 transition-colors",
                            "disabled:opacity-50 disabled:cursor-not-allowed",
                            "flex items-center justify-center gap-2",
                        )}
                    >
                        {#if isLoading}
                            <div class="animate-spin rounded-full h-5 w-5 border-2 border-white border-t-transparent"></div>
                            <span>ກຳລັງລີເຊັດ...</span>
                        {:else}
                            <span>ລີເຊັດລະຫັດຜ່ານ</span>
                        {/if}
                    </button>

                    <p class="text-center text-sm text-gray-500 dark:text-gray-400 mt-2">
                        <a href="/forgot-password" class="text-primary-600 hover:text-primary-700 dark:text-primary-400">
                            ຂໍລິ້ງລີເຊັດໃໝ່
                        </a>
                        &nbsp;·&nbsp;
                        <a href="/login" class="text-primary-600 hover:text-primary-700 dark:text-primary-400">
                            ກັບໄປເຂົ້າສູ່ລະບົບ
                        </a>
                    </p>
                </form>
            {/if}
        </div>

        <p class="text-center text-primary-100 text-sm mt-6">
            &copy; 2026 KPOS - Enterprise POS System
        </p>
    </div>
</div>
