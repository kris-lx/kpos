<script lang="ts">
    import { themeStore } from "$stores";
    import { i18n, t } from "$lib/i18n/index.svelte";
    import { cn } from "$utils";
    import { Store, Sun, Moon, Globe, ArrowLeft, Mail } from "lucide-svelte";
    import { toast } from "svelte-sonner";
    import { api } from "$lib/api";

    let email = $state("");
    let isLoading = $state(false);
    let error = $state("");
    let successMessage = $state("");
    let showLangMenu = $state(false);

    async function handleSubmit(e: SubmitEvent) {
        e.preventDefault();
        error = "";
        successMessage = "";
        isLoading = true;

        try {
            await api.post("auth/forgot-password", { json: { email } }).json();
            successMessage = "ຖ້າອີເມວນີ້ມີໃນລະບົບ, ພວກເຮົາໄດ້ສົ່ງລິ້ງປ່ຽນລະຫັດຜ່ານໄປໃຫ້ແລ້ວ. ກະລຸນາກວດເບິ່ງກ່ອງຈົດໝາຍຂອງທ່ານ.";
            toast.success("ສົ່ງອີເມວສຳເລັດ");
            email = "";
        } catch (err: any) {
            error = "ເກີດຂໍ້ຜິດພາດໃນການສົ່ງອີເມວ ກະລຸນາລອງໃໝ່ອີກຄັ້ງ";
            console.error(err);
        } finally {
            isLoading = false;
        }
    }
</script>

<svelte:head>
    <title>ລືມລະຫັດຜ່ານ - {t("app.name")}</title>
</svelte:head>

<div class="min-h-screen flex items-center justify-center bg-linear-to-br from-primary-500 to-primary-700 dark:from-gray-900 dark:to-gray-800 p-4">
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
            <div class="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-white dark:bg-gray-800 shadow-lg mb-4">
                <Store class="w-8 h-8 text-primary-600" />
            </div>
            <h1 class="text-3xl font-bold text-white">{t("app.name")}</h1>
            <p class="text-primary-100 mt-1">{t("app.title")}</p>
        </div>

        <!-- Forgot Password Form -->
        <div class="bg-white dark:bg-gray-800 rounded-2xl shadow-xl p-8 relative overflow-hidden">
            <!-- Back Button -->
            <a href="/login" class="absolute top-6 left-6 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors">
                <ArrowLeft class="w-5 h-5" />
            </a>

            <div class="text-center mb-6 mt-2">
                <div class="inline-flex items-center justify-center w-12 h-12 rounded-full bg-primary-100 dark:bg-primary-900/30 text-primary-600 dark:text-primary-400 mb-4">
                    <Mail class="w-6 h-6" />
                </div>
                <h2 class="text-xl font-semibold text-gray-900 dark:text-white mb-2">
                    ລືມລະຫັດຜ່ານ?
                </h2>
                <p class="text-sm text-gray-500 dark:text-gray-400">
                    ກະລຸນາປ້ອນອີເມວຂອງທ່ານທີ່ລົງທະບຽນໄວ້ເພື່ອຮັບລິ້ງປ່ຽນລະຫັດຜ່ານໃໝ່
                </p>
            </div>

            {#if error}
                <div class="mb-6 p-4 bg-danger-50 dark:bg-danger-900/20 border border-danger-200 dark:border-danger-800 rounded-xl text-danger-600 dark:text-danger-400 text-sm">
                    {error}
                </div>
            {/if}

            {#if successMessage}
                <div class="mb-6 p-4 bg-success-50 dark:bg-success-900/20 border border-success-200 dark:border-success-800 rounded-xl text-success-600 dark:text-success-400 text-sm text-center">
                    {successMessage}
                </div>
            {/if}

            <form onsubmit={handleSubmit} class="space-y-4">
                <!-- Email -->
                <div>
                    <label for="email" class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                        ອີເມວ
                    </label>
                    <input
                        type="email"
                        id="email"
                        bind:value={email}
                        required
                        disabled={isLoading || !!successMessage}
                        class={cn(
                            "w-full px-4 py-3 rounded-xl border transition-colors",
                            "bg-white dark:bg-gray-700 text-gray-900 dark:text-white",
                            "border-gray-300 dark:border-gray-600",
                            "focus:ring-2 focus:ring-primary-500 focus:border-primary-500",
                            "placeholder:text-gray-400 dark:placeholder:text-gray-500",
                            "disabled:opacity-60 disabled:cursor-not-allowed"
                        )}
                        placeholder="example@email.com"
                    />
                </div>

                <!-- Submit -->
                {#if !successMessage}
                    <button
                        type="submit"
                        disabled={isLoading || !email}
                        class={cn(
                            "w-full py-3 px-4 rounded-xl font-medium text-white mt-2",
                            "bg-primary-600 hover:bg-primary-700 transition-colors",
                            "disabled:opacity-50 disabled:cursor-not-allowed",
                            "flex items-center justify-center gap-2",
                        )}
                    >
                        {#if isLoading}
                            <div class="animate-spin rounded-full h-5 w-5 border-2 border-white border-t-transparent"></div>
                            <span>ກຳລັງສົ່ງ...</span>
                        {:else}
                            <span>ສົ່ງລິ້ງປ່ຽນລະຫັດຜ່ານ</span>
                        {/if}
                    </button>
                {:else}
                    <a
                        href="/login"
                        class={cn(
                            "w-full py-3 px-4 rounded-xl font-medium text-gray-700 dark:text-gray-200 mt-2",
                            "bg-gray-100 hover:bg-gray-200 dark:bg-gray-700 dark:hover:bg-gray-600 transition-colors",
                            "flex items-center justify-center gap-2 text-center",
                        )}
                    >
                        ກັບໄປໜ້າເຂົ້າສູ່ລະບົບ
                    </a>
                {/if}
            </form>
        </div>

        <!-- Footer -->
        <p class="text-center text-primary-100 text-sm mt-6">
            &copy; 2026 KPOS - Enterprise POS System
        </p>
    </div>
</div>
