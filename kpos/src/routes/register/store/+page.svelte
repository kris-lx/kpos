<script lang="ts">
    import { auth, themeStore } from "$stores";
    import { i18n, t } from "$lib/i18n/index.svelte";
    import { goto } from "$app/navigation";
    import { cn } from "$utils";
    import { api } from "$lib/api";
    import { 
        Store, Sun, Moon, Globe, Building2, 
        MapPin, Phone, Mail, FileText, Upload,
        Check, ArrowLeft, ArrowRight, Loader2
    } from "lucide-svelte";
    import { toast } from "svelte-sonner";

    // Form steps
    let currentStep = $state(1);
    const totalSteps = 3;
    
    // Form data
    let formData = $state({
        // Step 1 - Store/Branch Type
        type: "new_branch" as "new_store" | "new_branch",
        
        // Step 2 - Business Info
        businessName: "",
        businessCode: "",
        address: "",
        phone: "",
        email: "",
        taxId: "",
        description: "",
        
        // Step 3 - Additional Info
        reason: "",
        documents: [] as File[],
    });
    
    let isLoading = $state(false);
    let error = $state("");
    let showLangMenu = $state(false);
    let uploadedFiles = $state<string[]>([]);

    // Check if user is logged in
    $effect(() => {
        if (!auth.isAuthenticated && !auth.isLoading) {
            goto("/login");
        }
    });

    function nextStep() {
        if (validateCurrentStep()) {
            if (currentStep < totalSteps) {
                currentStep++;
            }
        }
    }

    function prevStep() {
        if (currentStep > 1) {
            currentStep--;
        }
    }

    function validateCurrentStep(): boolean {
        error = "";
        
        if (currentStep === 1) {
            return true; // Type selection is always valid
        }
        
        if (currentStep === 2) {
            if (!formData.businessName.trim()) {
                error = t("register.errors.businessNameRequired");
                return false;
            }
            if (!formData.businessCode.trim()) {
                error = t("register.errors.businessCodeRequired");
                return false;
            }
            if (!formData.address.trim()) {
                error = t("register.errors.addressRequired");
                return false;
            }
            if (!formData.phone.trim()) {
                error = t("register.errors.phoneRequired");
                return false;
            }
        }
        
        return true;
    }

    async function handleFileUpload(e: Event) {
        const target = e.target as HTMLInputElement;
        if (target.files) {
            formData.documents = [...formData.documents, ...Array.from(target.files)];
        }
    }

    function removeFile(index: number) {
        formData.documents = formData.documents.filter((_, i) => i !== index);
    }

    async function handleSubmit() {
        if (!validateCurrentStep()) return;
        
        isLoading = true;
        error = "";

        try {
            // Prepare request data
            const requestData: Record<string, any> = {
                type: formData.type,
                reason: formData.reason || undefined,
            };

            if (formData.type === "new_branch") {
                requestData.branchName = formData.businessName;
                requestData.branchCode = formData.businessCode;
                requestData.branchAddress = formData.address;
                requestData.branchPhone = formData.phone;
                requestData.branchEmail = formData.email || undefined;
            } else {
                requestData.storeName = formData.businessName;
                requestData.storeCode = formData.businessCode;
                requestData.storeAddress = formData.address;
                requestData.storePhone = formData.phone;
                requestData.storeEmail = formData.email || undefined;
            }

            // TODO: Handle file uploads separately if needed
            // For now, we just submit the form data

            const response = await api.post("stores/requests", {
                json: requestData
            }).json<any>();

            if (response.success) {
                toast.success(t("register.successMessage"));
                goto("/pos");
            } else {
                error = response.message || t("register.errors.submitFailed");
            }
        } catch (err: any) {
            console.error("Submit error:", err);
            error = err.message || t("register.errors.submitFailed");
        } finally {
            isLoading = false;
        }
    }
</script>

<svelte:head>
    <title>{t("register.storeTitle")} - {t("app.name")}</title>
</svelte:head>

<div
    class="min-h-screen bg-linear-to-br from-primary-500 to-primary-700 dark:from-gray-900 dark:to-gray-800 p-4"
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

    <!-- Back to Login -->
    <div class="absolute top-4 left-4">
        <a
            href="/pos"
            class="flex items-center gap-2 p-2 rounded-lg bg-white/20 hover:bg-white/30 text-white transition-colors"
        >
            <ArrowLeft class="w-5 h-5" />
            <span class="text-sm">{t("common.back")}</span>
        </a>
    </div>

    <div class="max-w-2xl mx-auto pt-16">
        <!-- Logo & Title -->
        <div class="text-center mb-8">
            <div
                class="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-white dark:bg-gray-800 shadow-lg mb-4"
            >
                <Building2 class="w-8 h-8 text-primary-600" />
            </div>
            <h1 class="text-3xl font-bold text-white">{t("register.storeTitle")}</h1>
            <p class="text-primary-100 mt-1">{t("register.storeSubtitle")}</p>
        </div>

        <!-- Progress Steps -->
        <div class="flex justify-center mb-8">
            <div class="flex items-center gap-3">
                {#each [1, 2, 3] as step}
                    <div class="flex items-center">
                        <div
                            class={cn(
                                "w-10 h-10 rounded-full flex items-center justify-center font-medium transition-colors",
                                currentStep >= step
                                    ? "bg-white text-primary-600"
                                    : "bg-white/30 text-white"
                            )}
                        >
                            {#if currentStep > step}
                                <Check class="w-5 h-5" />
                            {:else}
                                {step}
                            {/if}
                        </div>
                        {#if step < 3}
                            <div
                                class={cn(
                                    "w-16 h-1 mx-2 rounded transition-colors",
                                    currentStep > step ? "bg-white" : "bg-white/30"
                                )}
                            ></div>
                        {/if}
                    </div>
                {/each}
            </div>
        </div>

        <!-- Form Card -->
        <div class="bg-white dark:bg-gray-800 rounded-2xl shadow-xl p-8">
            {#if error}
                <div
                    class="mb-6 p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-xl text-red-600 dark:text-red-400 text-sm"
                >
                    {error}
                </div>
            {/if}

            <!-- Step 1: Type Selection -->
            {#if currentStep === 1}
                <div class="space-y-6">
                    <h2 class="text-xl font-semibold text-gray-900 dark:text-white mb-4">
                        {t("register.step1Title")}
                    </h2>
                    <p class="text-gray-600 dark:text-gray-400 mb-6">
                        {t("register.step1Desc")}
                    </p>

                    <div class="grid gap-4">
                        <button
                            type="button"
                            onclick={() => formData.type = "new_branch"}
                            class={cn(
                                "p-6 rounded-xl border-2 transition-all text-left",
                                formData.type === "new_branch"
                                    ? "border-primary-500 bg-primary-50 dark:bg-primary-900/20"
                                    : "border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600"
                            )}
                        >
                            <div class="flex items-start gap-4">
                                <div class={cn(
                                    "w-12 h-12 rounded-xl flex items-center justify-center",
                                    formData.type === "new_branch"
                                        ? "bg-primary-500 text-white"
                                        : "bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400"
                                )}>
                                    <Building2 class="w-6 h-6" />
                                </div>
                                <div>
                                    <h3 class="text-lg font-medium text-gray-900 dark:text-white">
                                        {t("register.newBranch")}
                                    </h3>
                                    <p class="text-sm text-gray-500 dark:text-gray-400 mt-1">
                                        {t("register.newBranchDesc")}
                                    </p>
                                </div>
                            </div>
                        </button>

                        <button
                            type="button"
                            onclick={() => formData.type = "new_store"}
                            class={cn(
                                "p-6 rounded-xl border-2 transition-all text-left",
                                formData.type === "new_store"
                                    ? "border-primary-500 bg-primary-50 dark:bg-primary-900/20"
                                    : "border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600"
                            )}
                        >
                            <div class="flex items-start gap-4">
                                <div class={cn(
                                    "w-12 h-12 rounded-xl flex items-center justify-center",
                                    formData.type === "new_store"
                                        ? "bg-primary-500 text-white"
                                        : "bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400"
                                )}>
                                    <Store class="w-6 h-6" />
                                </div>
                                <div>
                                    <h3 class="text-lg font-medium text-gray-900 dark:text-white">
                                        {t("register.newStore")}
                                    </h3>
                                    <p class="text-sm text-gray-500 dark:text-gray-400 mt-1">
                                        {t("register.newStoreDesc")}
                                    </p>
                                </div>
                            </div>
                        </button>
                    </div>
                </div>
            {/if}

            <!-- Step 2: Business Info -->
            {#if currentStep === 2}
                <div class="space-y-6">
                    <h2 class="text-xl font-semibold text-gray-900 dark:text-white mb-4">
                        {t("register.step2Title")}
                    </h2>

                    <div class="grid gap-4">
                        <!-- Business Name -->
                        <div>
                            <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                                {formData.type === "new_branch" ? t("register.branchName") : t("register.storeName")} *
                            </label>
                            <div class="relative">
                                <Building2 class="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                                <input
                                    type="text"
                                    bind:value={formData.businessName}
                                    class={cn(
                                        "w-full pl-12 pr-4 py-3 rounded-xl border transition-colors",
                                        "bg-white dark:bg-gray-700 text-gray-900 dark:text-white",
                                        "border-gray-300 dark:border-gray-600",
                                        "focus:ring-2 focus:ring-primary-500 focus:border-primary-500",
                                    )}
                                    placeholder={t("register.businessNamePlaceholder")}
                                />
                            </div>
                        </div>

                        <!-- Business Code -->
                        <div>
                            <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                                {t("register.businessCode")} *
                            </label>
                            <input
                                type="text"
                                bind:value={formData.businessCode}
                                class={cn(
                                    "w-full px-4 py-3 rounded-xl border transition-colors",
                                    "bg-white dark:bg-gray-700 text-gray-900 dark:text-white",
                                    "border-gray-300 dark:border-gray-600",
                                    "focus:ring-2 focus:ring-primary-500 focus:border-primary-500",
                                )}
                                placeholder={t("register.businessCodePlaceholder")}
                            />
                        </div>

                        <!-- Address -->
                        <div>
                            <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                                {t("register.address")} *
                            </label>
                            <div class="relative">
                                <MapPin class="absolute left-4 top-3 w-5 h-5 text-gray-400" />
                                <textarea
                                    bind:value={formData.address}
                                    rows="2"
                                    class={cn(
                                        "w-full pl-12 pr-4 py-3 rounded-xl border transition-colors resize-none",
                                        "bg-white dark:bg-gray-700 text-gray-900 dark:text-white",
                                        "border-gray-300 dark:border-gray-600",
                                        "focus:ring-2 focus:ring-primary-500 focus:border-primary-500",
                                    )}
                                    placeholder={t("register.addressPlaceholder")}
                                ></textarea>
                            </div>
                        </div>

                        <div class="grid grid-cols-2 gap-4">
                            <!-- Phone -->
                            <div>
                                <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                                    {t("register.phone")} *
                                </label>
                                <div class="relative">
                                    <Phone class="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                                    <input
                                        type="tel"
                                        bind:value={formData.phone}
                                        class={cn(
                                            "w-full pl-12 pr-4 py-3 rounded-xl border transition-colors",
                                            "bg-white dark:bg-gray-700 text-gray-900 dark:text-white",
                                            "border-gray-300 dark:border-gray-600",
                                            "focus:ring-2 focus:ring-primary-500 focus:border-primary-500",
                                        )}
                                        placeholder="020 xxxxxxxx"
                                    />
                                </div>
                            </div>

                            <!-- Email -->
                            <div>
                                <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                                    {t("register.email")}
                                </label>
                                <div class="relative">
                                    <Mail class="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                                    <input
                                        type="email"
                                        bind:value={formData.email}
                                        class={cn(
                                            "w-full pl-12 pr-4 py-3 rounded-xl border transition-colors",
                                            "bg-white dark:bg-gray-700 text-gray-900 dark:text-white",
                                            "border-gray-300 dark:border-gray-600",
                                            "focus:ring-2 focus:ring-primary-500 focus:border-primary-500",
                                        )}
                                        placeholder="email@example.com"
                                    />
                                </div>
                            </div>
                        </div>

                        <!-- Tax ID -->
                        <div>
                            <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                                ເລກປະຈຳຕົວຜູ້ເສຍອາກອນ
                            </label>
                            <input
                                type="text"
                                bind:value={formData.taxId}
                                class={cn(
                                    "w-full px-4 py-3 rounded-xl border transition-colors",
                                    "bg-white dark:bg-gray-700 text-gray-900 dark:text-white",
                                    "border-gray-300 dark:border-gray-600",
                                    "focus:ring-2 focus:ring-primary-500 focus:border-primary-500",
                                )}
                                placeholder="ເລກປະຈຳຕົວຜູ້ເສຍອາກອນ (ຖ້າມີ)"
                            />
                        </div>

                        <!-- Description -->
                        <div>
                            <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                                ລາຍລະອຽດຮ້ານ
                            </label>
                            <textarea
                                bind:value={formData.description}
                                rows="2"
                                class={cn(
                                    "w-full px-4 py-3 rounded-xl border transition-colors resize-none",
                                    "bg-white dark:bg-gray-700 text-gray-900 dark:text-white",
                                    "border-gray-300 dark:border-gray-600",
                                    "focus:ring-2 focus:ring-primary-500 focus:border-primary-500",
                                )}
                                placeholder="ອະທິບາຍກ່ຽວກັບຮ້ານ/ສາຂາ"
                            ></textarea>
                        </div>
                    </div>
                </div>
            {/if}

            <!-- Step 3: Additional Info -->
            {#if currentStep === 3}
                <div class="space-y-6">
                    <h2 class="text-xl font-semibold text-gray-900 dark:text-white mb-4">
                        {t("register.step3Title")}
                    </h2>

                    <!-- Reason -->
                    <div>
                        <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                            {t("register.reason")}
                        </label>
                        <div class="relative">
                            <FileText class="absolute left-4 top-3 w-5 h-5 text-gray-400" />
                            <textarea
                                bind:value={formData.reason}
                                rows="4"
                                class={cn(
                                    "w-full pl-12 pr-4 py-3 rounded-xl border transition-colors resize-none",
                                    "bg-white dark:bg-gray-700 text-gray-900 dark:text-white",
                                    "border-gray-300 dark:border-gray-600",
                                    "focus:ring-2 focus:ring-primary-500 focus:border-primary-500",
                                )}
                                placeholder={t("register.reasonPlaceholder")}
                            ></textarea>
                        </div>
                    </div>

                    <!-- File Upload -->
                    <div>
                        <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                            {t("register.documents")}
                        </label>
                        <div class="border-2 border-dashed border-gray-300 dark:border-gray-600 rounded-xl p-6 text-center">
                            <Upload class="w-10 h-10 mx-auto text-gray-400 mb-2" />
                            <p class="text-sm text-gray-600 dark:text-gray-400 mb-2">
                                {t("register.uploadDesc")}
                            </p>
                            <input
                                type="file"
                                id="file-upload"
                                multiple
                                accept=".pdf,.jpg,.jpeg,.png"
                                onchange={handleFileUpload}
                                class="hidden"
                            />
                            <label
                                for="file-upload"
                                class="inline-block px-4 py-2 bg-gray-100 dark:bg-gray-700 rounded-lg text-sm font-medium text-gray-700 dark:text-gray-300 cursor-pointer hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors"
                            >
                                {t("register.chooseFiles")}
                            </label>
                        </div>

                        {#if formData.documents.length > 0}
                            <div class="mt-4 space-y-2">
                                {#each formData.documents as file, index}
                                    <div class="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-700 rounded-lg">
                                        <span class="text-sm text-gray-700 dark:text-gray-300 truncate">
                                            {file.name}
                                        </span>
                                        <button
                                            type="button"
                                            onclick={() => removeFile(index)}
                                            class="text-red-500 hover:text-red-600 text-sm"
                                        >
                                            {t("common.delete")}
                                        </button>
                                    </div>
                                {/each}
                            </div>
                        {/if}
                    </div>

                    <!-- Summary -->
                    <div class="p-4 bg-gray-50 dark:bg-gray-700/50 rounded-xl">
                        <h3 class="font-medium text-gray-900 dark:text-white mb-3">
                            {t("register.summary")}
                        </h3>
                        <div class="space-y-2 text-sm">
                            <div class="flex justify-between">
                                <span class="text-gray-600 dark:text-gray-400">{t("register.type")}:</span>
                                <span class="text-gray-900 dark:text-white font-medium">
                                    {formData.type === "new_branch" ? t("register.newBranch") : t("register.newStore")}
                                </span>
                            </div>
                            <div class="flex justify-between">
                                <span class="text-gray-600 dark:text-gray-400">{t("register.name")}:</span>
                                <span class="text-gray-900 dark:text-white font-medium">{formData.businessName}</span>
                            </div>
                            <div class="flex justify-between">
                                <span class="text-gray-600 dark:text-gray-400">{t("register.code")}:</span>
                                <span class="text-gray-900 dark:text-white font-medium">{formData.businessCode}</span>
                            </div>
                            <div class="flex justify-between">
                                <span class="text-gray-600 dark:text-gray-400">{t("register.phone")}:</span>
                                <span class="text-gray-900 dark:text-white font-medium">{formData.phone}</span>
                            </div>
                        </div>
                    </div>
                </div>
            {/if}

            <!-- Navigation Buttons -->
            <div class="flex justify-between mt-8 pt-6 border-t border-gray-100 dark:border-gray-700">
                {#if currentStep > 1}
                    <button
                        type="button"
                        onclick={prevStep}
                        class={cn(
                            "flex items-center gap-2 px-6 py-3 rounded-xl font-medium transition-colors",
                            "text-gray-700 dark:text-gray-300 bg-gray-100 dark:bg-gray-700",
                            "hover:bg-gray-200 dark:hover:bg-gray-600"
                        )}
                    >
                        <ArrowLeft class="w-5 h-5" />
                        {t("common.back")}
                    </button>
                {:else}
                    <div></div>
                {/if}

                {#if currentStep < totalSteps}
                    <button
                        type="button"
                        onclick={nextStep}
                        class={cn(
                            "flex items-center gap-2 px-6 py-3 rounded-xl font-medium text-white transition-colors",
                            "bg-primary-600 hover:bg-primary-700"
                        )}
                    >
                        {t("common.next")}
                        <ArrowRight class="w-5 h-5" />
                    </button>
                {:else}
                    <button
                        type="button"
                        onclick={handleSubmit}
                        disabled={isLoading}
                        class={cn(
                            "flex items-center gap-2 px-6 py-3 rounded-xl font-medium text-white transition-colors",
                            "bg-primary-600 hover:bg-primary-700",
                            "disabled:opacity-50 disabled:cursor-not-allowed"
                        )}
                    >
                        {#if isLoading}
                            <Loader2 class="w-5 h-5 animate-spin" />
                            {t("common.submitting")}
                        {:else}
                            <Check class="w-5 h-5" />
                            {t("register.submit")}
                        {/if}
                    </button>
                {/if}
            </div>
        </div>

        <!-- Footer -->
        <p class="text-center text-primary-100 text-sm mt-6">
            &copy; 2026 KPOS - Enterprise POS System
        </p>
    </div>
</div>
