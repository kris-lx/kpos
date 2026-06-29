<script lang="ts">
    import { themeStore } from "$stores";
    import { goto } from "$app/navigation";
    import { api } from "$lib/api";
    import { onMount } from "svelte";
    import {
        Store, Sun, Moon, Building2,
        MapPin, Phone, Mail, FileText, Upload,
        Check, ArrowLeft, ArrowRight, Loader2,
        User, Lock, Eye, EyeOff, CreditCard,
        ShieldCheck, CheckCircle2, X
    } from "lucide-svelte";
    import { toast } from "svelte-sonner";
    import { t } from '$lib/i18n/index.svelte';
    import { cn, enforcePhoneInput, isValidLaoPhone } from "$utils";

    // Steps: 1=Account, 2=Business, 3=KYC, 4=Review
    let currentStep = $state(1);
    const totalSteps = 4;
    const stepLabels = ["ບັນຊີ", "ທຸລະກິດ", "KYC", "ສະຫຼຸບ"];

    let showPassword = $state(false);
    let showConfirmPassword = $state(false);
    let isLoading = $state(false);
    let isSubmitted = $state(false);
    let error = $state("");
    let submittedUserId = $state("");

    // Password strength
    let passwordStrength = $derived.by(() => {
        const p = form.password;
        if (!p) return { score: 0, label: '', color: '' };
        let score = 0;
        if (p.length >= 8) score++;
        if (p.length >= 12) score++;
        if (/[A-Z]/.test(p)) score++;
        if (/[0-9]/.test(p)) score++;
        if (/[^A-Za-z0-9]/.test(p)) score++;
        if (score <= 1) return { score, label: 'ອ່ອນ', color: 'bg-danger-500' };
        if (score <= 3) return { score, label: 'ປານກາງ', color: 'bg-amber-500' };
        return { score, label: 'ແຂງແຮງ', color: 'bg-success-500' };
    });

    // Form data
    let form = $state({
        // Step 1 — Account
        name: "",
        email: "",
        password: "",
        confirmPassword: "",
        phone: "",

        // Step 2 — Business
        storeName: "",
        storeCode: "",
        businessType: "retail" as string,
        storeAddress: "",
        storePhone: "",
        storeEmail: "",

        // Step 3 — KYC
        ownerIdType: "national_id" as string,
        ownerIdNumber: "",
        ownerName: "",
        ownerNationality: "LAO",
        businessLicenseNo: "",
        taxCertificateNo: "",
        reason: "",
        documents: [] as File[],
    });

    let businessTypes = $state<{value:string;label:string;labelLao?:string}[]>([
        { value: "retail", label: "ຂາຍຍ່ອຍ / Retail" },
        { value: "restaurant", label: "ຮ້ານອາຫານ / Restaurant" },
        { value: "wholesale", label: "ຂາຍສົ່ງ / Wholesale" },
        { value: "service", label: "ບໍລິການ / Service" },
        { value: "other", label: "ອື່ນໆ / Other" },
    ]);

    let idTypes = $state<{value:string;label:string;labelLao?:string}[]>([
        { value: "national_id", label: "ບັດປະຈຳຕົວ" },
        { value: "passport", label: "ໜັງສືຜ່ານແດນ" },
        { value: "family_book", label: "ສຳມະໂນຄົວ" },
    ]);

    onMount(async () => {
        try {
            const res = await api.get('settings/enums/public?type=business_type,id_type').json<any>();
            if (res.success) {
                if (res.data?.business_type?.length) {
                    businessTypes = res.data.business_type.map((e: any) => ({ value: e.value, label: e.labelLao || e.label }));
                }
                if (res.data?.id_type?.length) {
                    idTypes = res.data.id_type.map((e: any) => ({ value: e.value, label: e.labelLao || e.label }));
                }
            }
        } catch {}
    });

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

    function validateStep(): boolean {
        error = "";
        if (currentStep === 1) {
            if (!form.name.trim()) { error = "ກະລຸນາໃສ່ຊື່-ນາມສະກຸນ"; return false; }
            if (!form.email.trim() || !emailRegex.test(form.email)) { error = "ກະລຸນາໃສ່ອີເມວທີ່ຖືກຕ້ອງ (ຕົວຢ່າງ: name@example.com)"; return false; }
            if (form.password.length < 8) { error = "ລະຫັດຜ່ານຕ້ອງມີຢ່າງໜ້ອຍ 8 ຕົວ"; return false; }
            if (passwordStrength.score < 2) { error = "ລະຫັດຜ່ານອ່ອນເກີນໄປ — ຕ້ອງມີຕົວໃຫຍ່, ຕົວເລກ ຫຼື ອັກຂະລະພິເສດ"; return false; }
            if (form.password !== form.confirmPassword) { error = "ລະຫັດຜ່ານບໍ່ຕົງກັນ"; return false; }
            if (!form.phone.trim()) { error = "ກະລຸນາໃສ່ເບີໂທ"; return false; }
            if (!isValidLaoPhone(form.phone)) { error = "ເບີໂທບໍ່ຖືກຕ້ອງ (ຮູບແບບ: 20xxxxxxxx, 10 ຕົວເລກ)"; return false; }
        }
        if (currentStep === 2) {
            if (!form.storeName.trim()) { error = "ກະລຸນາໃສ່ຊື່ຮ້ານ"; return false; }
            if (!form.storeCode.trim()) { error = "ກະລຸນາໃສ່ລະຫັດຮ້ານ"; return false; }
            if (!form.storeAddress.trim()) { error = "ກະລຸນາໃສ່ທີ່ຢູ່"; return false; }
            if (!form.storePhone.trim()) { error = "ກະລຸນາໃສ່ເບີໂທຮ້ານ"; return false; }
            if (!isValidLaoPhone(form.storePhone)) { error = "ເບີໂທຮ້ານບໍ່ຖືກຕ້ອງ (ຮູບແບບ: 20xxxxxxxx, 10 ຕົວເລກ)"; return false; }
        }
        if (currentStep === 3) {
            if (!form.ownerIdNumber.trim()) { error = "ກະລຸນາໃສ່ເລກທີ່ບັດ/ໜັງສືຜ່ານແດນ"; return false; }
            if (form.documents.length === 0) { error = "ກະລຸນາອັບໂຫລດເອກະສານຢ່າງໜ້ອຍ 1 ໄຟລ໌ (ບັດປະຈຳຕົວ ຫຼື ໜັງສືຜ່ານແດນ)"; return false; }
        }
        return true;
    }

    function next() { if (validateStep() && currentStep < totalSteps) currentStep++; }
    function prev() { if (currentStep > 1) currentStep--; }

    function handleFileUpload(e: Event) {
        const t = e.target as HTMLInputElement;
        if (t.files) {
            const maxSize = 5 * 1024 * 1024; // 5MB
            const validFiles = Array.from(t.files).filter(f => {
                if (f.size > maxSize) {
                    toast.error(`${f.name} ມີຂະໜາດໃຫຍ່ເກີນ (ສູງສຸດ 5MB)`);
                    return false;
                }
                return true;
            });
            form.documents = [...form.documents, ...validFiles];
        }
    }
    function removeFile(i: number) { form.documents = form.documents.filter((_, idx) => idx !== i); }

    function fileToBase64(file: File): Promise<string> {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(reader.result as string);
            reader.onerror = reject;
            reader.readAsDataURL(file);
        });
    }

    async function handleSubmit() {
        if (!validateStep()) return;
        isLoading = true;
        error = "";
        try {
            // Convert uploaded files to base64
            const docBase64: { name: string; data: string; type: string }[] = [];
            for (const file of form.documents) {
                const base64 = await fileToBase64(file);
                docBase64.push({ name: file.name, data: base64, type: file.type });
            }

            const res = await api.post("admin/register-and-apply", {
                json: {
                    name: form.name,
                    email: form.email,
                    password: form.password,
                    phone: form.phone,
                    storeName: form.storeName,
                    storeCode: form.storeCode,
                    businessType: form.businessType,
                    storeAddress: form.storeAddress,
                    storePhone: form.storePhone,
                    storeEmail: form.storeEmail || undefined,
                    ownerIdType: form.ownerIdType,
                    ownerIdNumber: form.ownerIdNumber,
                    ownerName: form.ownerName || form.name,
                    ownerNationality: form.ownerNationality,
                    businessLicenseNo: form.businessLicenseNo,
                    taxCertificateNo: form.taxCertificateNo,
                    reason: form.reason,
                    documents: docBase64,
                }
            }).json<any>();

            if (res.success) {
                submittedUserId = res.data?.userId || "";
                isSubmitted = true;
                toast.success("ສົ່ງຄຳຮ້ອງສຳເລັດ! ລໍຖ້າການອະນຸມັດ");
            } else {
                error = res.error?.message || "ສົ່ງຄຳຮ້ອງບໍ່ສຳເລັດ";
            }
        } catch (err: any) {
            let msg = "";
            try { msg = (await err?.response?.json())?.error?.message ?? ""; } catch { /* ignore */ }
            error = msg || err?.message || "ເກີດຂໍ້ຜິດພາດ ກະລຸນາລອງໃໝ່";
        } finally {
            isLoading = false;
        }
    }
</script>

<svelte:head>
    <title>ສະໝັກເປີດຮ້ານ - KPOS</title>
</svelte:head>

<div class="min-h-screen bg-linear-to-br from-primary-600 to-primary-800 dark:from-gray-900 dark:to-gray-800 p-4">
    <!-- Top bar -->
    <div class="absolute top-4 left-4 right-4 flex justify-between items-center">
        <a href="/login" class="flex items-center gap-2 px-3 py-2 rounded-lg bg-white/20 hover:bg-white/30 text-white text-sm transition-colors">
            <ArrowLeft class="w-4 h-4" /> ກັບໄປໜ້າເຂົ້າສູ່ລະບົບ
        </a>
        <button type="button" onclick={() => themeStore.toggle()} class="p-2 rounded-lg bg-white/20 hover:bg-white/30 text-white transition-colors">
            {#if themeStore.isDark}<Sun class="w-5 h-5" />{:else}<Moon class="w-5 h-5" />{/if}
        </button>
    </div>

    <div class="max-w-2xl mx-auto pt-20 pb-10">
        <!-- Logo & Title -->
        <div class="text-center mb-8">
            <div
                class="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-white dark:bg-gray-800 shadow-lg mb-4"
            >
                <Building2 class="w-8 h-8 text-primary-600" />
            </div>
            <h1 class="text-3xl font-bold text-white">ສະໝັກເປີດຮ້ານ</h1>
            <p class="text-primary-100 mt-1">ສ້າງບັນຊີ ແລະ ຍື່ນຄຳຮ້ອງເປີດຮ້ານ</p>
        </div>

        {#if isSubmitted}
            <!-- Success State -->
            <div class="bg-white dark:bg-gray-800 rounded-2xl shadow-xl p-8 text-center">
                <div class="inline-flex items-center justify-center w-20 h-20 rounded-full bg-success-100 dark:bg-success-900/30 mb-6">
                    <CheckCircle2 class="w-10 h-10 text-success-500" />
                </div>
                <h2 class="text-2xl font-bold text-gray-900 dark:text-white mb-3">ສົ່ງຄຳຮ້ອງສຳເລັດ!</h2>
                <p class="text-gray-600 dark:text-gray-400 mb-2">ຄຳຮ້ອງຂອງທ່ານຖືກສົ່ງເຂົ້າລະບົບແລ້ວ</p>
                <p class="text-gray-500 dark:text-gray-500 text-sm mb-8">ທີມງານຈະທົບທວນ ແລະ ຕິດຕໍ່ກັບໄປຫາທ່ານພາຍໃນ 1-3 ວັນທຳການ</p>
                <div class="p-4 bg-blue-50 dark:bg-blue-900/20 rounded-xl text-left mb-6">
                    <p class="text-sm text-blue-700 dark:text-blue-300 font-medium mb-1">ຂັ້ນຕອນຕໍ່ໄປ:</p>
                    <ul class="text-sm text-blue-600 dark:text-blue-400 space-y-1 list-disc list-inside">
                        <li>ລໍຖ້າການທົບທວນຈາກທີມງານ</li>
                        <li>ທ່ານຈະໄດ້ຮັບອີເມວແຈ້ງເຕືອນ</li>
                        <li>ເມື່ອໄດ້ຮັບການອະນຸມັດ, ສາມາດເຂົ້າສູ່ລະບົບໄດ້ທັນທີ</li>
                    </ul>
                </div>
                <a href="/login" class="inline-flex items-center gap-2 px-6 py-3 bg-primary-600 hover:bg-primary-700 text-white rounded-xl font-medium transition-colors">
                    ໄປໜ້າເຂົ້າສູ່ລະບົບ
                </a>
            </div>
        {:else}
            <!-- Progress Steps -->
            <div class="flex justify-center mb-8">
            <div class="flex items-center">
                {#each [1, 2, 3, 4] as step}
                    <div class="flex items-center">
                        <div class="flex flex-col items-center">
                            <div class={cn(
                                "w-10 h-10 rounded-full flex items-center justify-center font-medium transition-all",
                                currentStep > step ? "bg-white text-primary-600" :
                                currentStep === step ? "bg-white text-primary-600 ring-4 ring-white/30" :
                                "bg-white/30 text-white"
                            )}>
                                {#if currentStep > step}<Check class="w-5 h-5" />{:else}{step}{/if}
                            </div>
                            <span class="text-xs text-white/80 mt-1 hidden sm:block">{stepLabels[step - 1]}</span>
                        </div>
                        {#if step < 4}
                            <div class={cn("w-10 h-1 mx-1 rounded transition-colors", currentStep > step ? "bg-white" : "bg-white/30")}></div>
                        {/if}
                    </div>
                {/each}
            </div>
        </div>

        <!-- Form Card -->
        <div class="bg-white dark:bg-gray-800 rounded-2xl shadow-xl p-8">
            {#if error}
                <div class="mb-6 p-4 bg-danger-50 dark:bg-danger-900/20 border border-danger-200 dark:border-danger-800 rounded-xl text-danger-600 dark:text-danger-400 text-sm">
                    {error}
                </div>
            {/if}

            <!-- Step 1: Account -->
            {#if currentStep === 1}
                <div class="space-y-5">
                    <h2 class="text-xl font-semibold text-gray-900 dark:text-white">ສ້າງບັນຊີຜູ້ໃຊ້</h2>
                    <p class="text-gray-500 dark:text-gray-400 text-sm">ຂໍ້ມູນນີ້ຈະໃຊ້ສຳລັບເຂົ້າສູ່ລະບົບ</p>
                    <div>
                        <label for="s1-name" class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">ຊື່-ນາມສະກຸນ *</label>
                        <div class="relative">
                            <User class="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                            <input id="s1-name" type="text" bind:value={form.name} placeholder="ຊື່ ນາມສະກຸນ" class="w-full pl-10 pr-4 py-3 rounded-xl border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-primary-500 focus:border-primary-500 transition-colors" />
                        </div>
                    </div>
                    <div>
                        <label for="s1-email" class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">ອີເມວ *</label>
                        <div class="relative">
                            <Mail class="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                            <input id="s1-email" type="email" bind:value={form.email} placeholder="email@example.com" class="w-full pl-10 pr-4 py-3 rounded-xl border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-primary-500 focus:border-primary-500 transition-colors" />
                        </div>
                    </div>
                    <div>
                        <label for="s1-phone" class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">ເບີໂທ *</label>
                        <div class="relative">
                            <Phone class="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                            <input id="s1-phone" type="tel" bind:value={form.phone} oninput={(e) => { form.phone = enforcePhoneInput(e.currentTarget.value); }} placeholder="20xxxxxxxx" maxlength="10" class="w-full pl-10 pr-4 py-3 rounded-xl border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-primary-500 focus:border-primary-500 transition-colors" />
                            <span class="text-xs text-gray-400 mt-1 block">ຮູບແບບ: 20xxxxxxxx (10 ຕົວເລກ)</span>
                        </div>
                    </div>
                    <div>
                        <label for="s1-pw" class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">ລະຫັດຜ່ານ * (ຢ່າງໜ້ອຍ 8 ຕົວ)</label>
                        <div class="relative">
                            <Lock class="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                            <input id="s1-pw" type={showPassword ? "text" : "password"} bind:value={form.password} placeholder="••••••••" class="w-full pl-10 pr-10 py-3 rounded-xl border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-primary-500 focus:border-primary-500 transition-colors" />
                            <button type="button" onclick={() => showPassword = !showPassword} class="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
                                {#if showPassword}<EyeOff class="w-5 h-5" />{:else}<Eye class="w-5 h-5" />{/if}
                            </button>
                        </div>
                        {#if form.password}
                            <div class="mt-2">
                                <div class="flex gap-1 mb-1">
                                    {#each [1,2,3,4,5] as i}
                                        <div class={cn("h-1.5 flex-1 rounded-full transition-colors", i <= passwordStrength.score ? passwordStrength.color : 'bg-gray-200 dark:bg-gray-600')}></div>
                                    {/each}
                                </div>
                                <p class="text-xs {passwordStrength.score <= 1 ? 'text-danger-500' : passwordStrength.score <= 3 ? 'text-amber-500' : 'text-success-600'}">
                                    ຄວາມເຂັ້ມຂຸ້ນ: {passwordStrength.label}
                                    {#if passwordStrength.score < 3} — ໃຊ້ຕົວໃຫຍ່, ຕົວເລກ ແລະ ສັນຍາລັກເພື່ອເພີ່ມຄວາມປອດໄພ{/if}
                                </p>
                            </div>
                        {/if}
                    </div>
                    <div>
                        <label for="s1-cpw" class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">ຢືນຢັນລະຫັດຜ່ານ *</label>
                        <div class="relative">
                            <Lock class="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                            <input id="s1-cpw" type={showConfirmPassword ? "text" : "password"} bind:value={form.confirmPassword} placeholder="••••••••" class="w-full pl-10 pr-10 py-3 rounded-xl border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-primary-500 focus:border-primary-500 transition-colors" />
                            <button type="button" onclick={() => showConfirmPassword = !showConfirmPassword} class="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
                                {#if showConfirmPassword}<EyeOff class="w-5 h-5" />{:else}<Eye class="w-5 h-5" />{/if}
                            </button>
                        </div>
                    </div>
                </div>
            {/if}

            <!-- Step 2: Business Info -->
            {#if currentStep === 2}
                <div class="space-y-5">
                    <h2 class="text-xl font-semibold text-gray-900 dark:text-white">ຂໍ້ມູນທຸລະກິດ</h2>
                    <p class="text-gray-500 dark:text-gray-400 text-sm">ຂໍ້ມູນກ່ຽວກັບຮ້ານຂອງທ່ານ</p>
                    <div>
                        <label for="s2-sname" class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">ຊື່ຮ້ານ *</label>
                        <div class="relative">
                            <Store class="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                            <input id="s2-sname" type="text" bind:value={form.storeName} placeholder="ຊື່ຮ້ານ" class="w-full pl-10 pr-4 py-3 rounded-xl border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-primary-500 focus:border-primary-500 transition-colors" />
                        </div>
                    </div>
                    <div>
                        <label for="s2-scode" class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">ລະຫັດຮ້ານ *</label>
                        <input id="s2-scode" type="text" bind:value={form.storeCode} placeholder="ຕົວຢ່າງ: SHOP001" class="w-full px-4 py-3 rounded-xl border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-primary-500 focus:border-primary-500 transition-colors" />
                    </div>
                    <div>
                        <label for="s2-btype" class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">ປະເພດທຸລະກິດ</label>
                        <select id="s2-btype" bind:value={form.businessType} class="w-full px-4 py-3 rounded-xl border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-primary-500 focus:border-primary-500 transition-colors">
                            {#each businessTypes as bt}<option value={bt.value}>{bt.label}</option>{/each}
                        </select>
                    </div>
                    <div>
                        <label for="s2-addr" class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">ທີ່ຢູ່ *</label>
                        <div class="relative">
                            <MapPin class="absolute left-3 top-3 w-5 h-5 text-gray-400" />
                            <textarea id="s2-addr" bind:value={form.storeAddress} rows="2" placeholder="ທີ່ຢູ່ຮ້ານ" class="w-full pl-10 pr-4 py-3 rounded-xl border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-primary-500 focus:border-primary-500 transition-colors resize-none"></textarea>
                        </div>
                    </div>
                    <div class="grid grid-cols-2 gap-4">
                        <div>
                            <label for="s2-sphone" class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">ເບີໂທຮ້ານ *</label>
                            <div class="relative">
                                <Phone class="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                                <input id="s2-sphone" type="tel" bind:value={form.storePhone} oninput={(e) => { form.storePhone = enforcePhoneInput(e.currentTarget.value); }} placeholder="20xxxxxxxx" maxlength="10" class="w-full pl-10 pr-4 py-3 rounded-xl border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-primary-500 focus:border-primary-500 transition-colors" />
                                <span class="text-xs text-gray-400 mt-1 block">ຮູບແບບ: 20xxxxxxxx</span>
                            </div>
                        </div>
                        <div>
                            <label for="s2-semail" class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">ອີເມວຮ້ານ</label>
                            <div class="relative">
                                <Mail class="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                                <input id="s2-semail" type="email" bind:value={form.storeEmail} placeholder="shop@example.com" class="w-full pl-10 pr-4 py-3 rounded-xl border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-primary-500 focus:border-primary-500 transition-colors" />
                            </div>
                        </div>
                    </div>
                </div>
            {/if}

            <!-- Step 3: KYC -->
            {#if currentStep === 3}
                <div class="space-y-5">
                    <h2 class="text-xl font-semibold text-gray-900 dark:text-white">ເອກະສານ KYC</h2>
                    <p class="text-gray-500 dark:text-gray-400 text-sm">ຂໍ້ມູນຢືນຢັນຕົວຕົນເຈົ້າຂອງຮ້ານ</p>
                    <div class="grid grid-cols-2 gap-4">
                        <div>
                            <label for="s3-idtype" class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">ປະເພດໄອດີ</label>
                            <select id="s3-idtype" bind:value={form.ownerIdType} class="w-full px-4 py-3 rounded-xl border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-primary-500 focus:border-primary-500 transition-colors">
                                {#each idTypes as idType}<option value={idType.value}>{idType.label}</option>{/each}
                            </select>
                        </div>
                        <div>
                            <label for="s3-idno" class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">ເລກທີ *</label>
                            <div class="relative">
                                <CreditCard class="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                                <input id="s3-idno" type="text" bind:value={form.ownerIdNumber} placeholder="ເລກທີໄອດີ" class="w-full pl-10 pr-4 py-3 rounded-xl border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-primary-500 focus:border-primary-500 transition-colors" />
                            </div>
                        </div>
                    </div>
                    <div>
                        <label for="s3-oname" class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">ຊື່ເຈົ້າຂອງ (ຕາມໄອດີ)</label>
                        <div class="relative">
                            <User class="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                            <input id="s3-oname" type="text" bind:value={form.ownerName} placeholder="ຊື່ ນາມສະກຸນ ຕາມໄອດີ" class="w-full pl-10 pr-4 py-3 rounded-xl border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-primary-500 focus:border-primary-500 transition-colors" />
                        </div>
                    </div>
                    <div class="grid grid-cols-2 gap-4">
                        <div>
                            <label for="s3-bizlic" class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">ໃບທະບຽນວິສາຫະກິດ</label>
                            <input id="s3-bizlic" type="text" bind:value={form.businessLicenseNo} placeholder="ເລກໃບທະບຽນ (ຖ້າມີ)" class="w-full px-4 py-3 rounded-xl border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-primary-500 focus:border-primary-500 transition-colors" />
                        </div>
                        <div>
                            <label for="s3-taxno" class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">ເລກປະຈຳຕົວຜູ້ເສຍອາກອນ</label>
                            <input id="s3-taxno" type="text" bind:value={form.taxCertificateNo} placeholder="ເລກອາກອນ (ຖ້າມີ)" class="w-full px-4 py-3 rounded-xl border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-primary-500 focus:border-primary-500 transition-colors" />
                        </div>
                    </div>
                    <div>
                        <label for="s3-reason" class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">ເຫດຜົນການຍື່ນຄຳຮ້ອງ</label>
                        <div class="relative">
                            <FileText class="absolute left-3 top-3 w-5 h-5 text-gray-400" />
                            <textarea id="s3-reason" bind:value={form.reason} rows="3" placeholder="ອະທິບາຍສັ້ນໆກ່ຽວກັບທຸລະກິດຂອງທ່ານ" class="w-full pl-10 pr-4 py-3 rounded-xl border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-primary-500 focus:border-primary-500 transition-colors resize-none"></textarea>
                        </div>
                    </div>
                    <div>
                        <label for="doc-upload" class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">ອັບໂຫລດເອກະສານ * <span class="text-danger-500">(ຕ້ອງການ)</span> — PDF, JPG, PNG ສູງສຸດ 5MB ຕໍ່ໄຟລ໌</label>
                        <div class="mb-2 p-3 bg-blue-50 dark:bg-blue-900/20 rounded-lg text-xs text-blue-700 dark:text-blue-300">
                            <p class="font-medium mb-1">ເອກະສານທີ່ຕ້ອງອັບໂຫລດ:</p>
                            <ul class="list-disc list-inside space-y-0.5">
                                <li>ໃບທະບຽນວິສາຫະກິດ (ຖ້າມີ)</li>
                                <li>ບັດປະຈຳຕົວ ຫຼື ໜັງສືຜ່ານແດນ (ພັດສະປອດ)</li>
                            </ul>
                        </div>
                        <div class="border-2 border-dashed border-gray-300 dark:border-gray-600 rounded-xl p-5 text-center">
                            <Upload class="w-8 h-8 mx-auto text-gray-400 mb-2" />
                            <p class="text-xs text-gray-500 dark:text-gray-400 mb-3">ລາກໄຟລ໌ມາວາງ ຫຼື ກົດເລືອກໄຟລ໌</p>
                            <input type="file" id="doc-upload" multiple accept=".pdf,.jpg,.jpeg,.png" onchange={handleFileUpload} class="hidden" />
                            <label for="doc-upload" class="inline-block px-4 py-2 bg-gray-100 dark:bg-gray-700 rounded-lg text-sm font-medium text-gray-700 dark:text-gray-300 cursor-pointer hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors">ເລືອກໄຟລ໌</label>
                        </div>
                        {#if form.documents.length > 0}
                            <div class="mt-3 space-y-2">
                                {#each form.documents as file, i}
                                    <div class="flex items-center justify-between p-2 bg-gray-50 dark:bg-gray-700 rounded-lg">
                                        <span class="text-sm text-gray-700 dark:text-gray-300 truncate">{file.name}</span>
                                        <button type="button" onclick={() => removeFile(i)} class="ml-2 text-danger-500 hover:text-danger-600"><X class="w-4 h-4" /></button>
                                    </div>
                                {/each}
                            </div>
                        {/if}
                    </div>
                </div>
            {/if}

            <!-- Step 4: Review -->
            {#if currentStep === 4}
                <div class="space-y-5">
                    <h2 class="text-xl font-semibold text-gray-900 dark:text-white">ກວດສອບຂໍ້ມູນ</h2>
                    <p class="text-gray-500 dark:text-gray-400 text-sm">ກວດສອບຂໍ້ມູນກ່ອນສົ່ງຄຳຮ້ອງ</p>
                    <div class="space-y-4">
                        <div class="p-4 bg-gray-50 dark:bg-gray-700/50 rounded-xl">
                            <div class="flex items-center gap-2 mb-3">
                                <User class="w-4 h-4 text-primary-500" />
                                <h3 class="font-medium text-gray-900 dark:text-white text-sm">ຂໍ້ມູນບັນຊີ</h3>
                            </div>
                            <div class="grid grid-cols-2 gap-2 text-sm">
                                <span class="text-gray-500 dark:text-gray-400">ຊື່:</span><span class="text-gray-900 dark:text-white font-medium">{form.name}</span>
                                <span class="text-gray-500 dark:text-gray-400">ອີເມວ:</span><span class="text-gray-900 dark:text-white font-medium">{form.email}</span>
                                <span class="text-gray-500 dark:text-gray-400">ເບີໂທ:</span><span class="text-gray-900 dark:text-white font-medium">{form.phone}</span>
                            </div>
                        </div>
                        <div class="p-4 bg-gray-50 dark:bg-gray-700/50 rounded-xl">
                            <div class="flex items-center gap-2 mb-3">
                                <Store class="w-4 h-4 text-primary-500" />
                                <h3 class="font-medium text-gray-900 dark:text-white text-sm">ຂໍ້ມູນຮ້ານ</h3>
                            </div>
                            <div class="grid grid-cols-2 gap-2 text-sm">
                                <span class="text-gray-500 dark:text-gray-400">ຊື່ຮ້ານ:</span><span class="text-gray-900 dark:text-white font-medium">{form.storeName}</span>
                                <span class="text-gray-500 dark:text-gray-400">ລະຫັດ:</span><span class="text-gray-900 dark:text-white font-medium">{form.storeCode}</span>
                                <span class="text-gray-500 dark:text-gray-400">ປະເພດ:</span><span class="text-gray-900 dark:text-white font-medium">{businessTypes.find(b => b.value === form.businessType)?.label ?? form.businessType}</span>
                                <span class="text-gray-500 dark:text-gray-400">ເບີໂທ:</span><span class="text-gray-900 dark:text-white font-medium">{form.storePhone}</span>
                            </div>
                        </div>
                        <div class="p-4 bg-gray-50 dark:bg-gray-700/50 rounded-xl">
                            <div class="flex items-center gap-2 mb-3">
                                <ShieldCheck class="w-4 h-4 text-primary-500" />
                                <h3 class="font-medium text-gray-900 dark:text-white text-sm">KYC</h3>
                            </div>
                            <div class="grid grid-cols-2 gap-2 text-sm">
                                <span class="text-gray-500 dark:text-gray-400">ປະເພດໄອດີ:</span><span class="text-gray-900 dark:text-white font-medium">{idTypes.find(t => t.value === form.ownerIdType)?.label ?? form.ownerIdType}</span>
                                <span class="text-gray-500 dark:text-gray-400">ເລກທີ:</span><span class="text-gray-900 dark:text-white font-medium">{form.ownerIdNumber}</span>
                                <span class="text-gray-500 dark:text-gray-400">ເອກະສານ:</span><span class="text-gray-900 dark:text-white font-medium">{form.documents.length} ໄຟລ໌</span>
                            </div>
                        </div>
                    </div>
                    <div class="p-4 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-xl text-sm text-amber-700 dark:text-amber-300">
                        ຫຼັງຈາກສົ່ງຄຳຮ້ອງ, ທີມງານຈະທົບທວນ ແລະ ຕິດຕໍ່ກັບໄປພາຍໃນ 1-3 ວັນທຳການ
                    </div>
                </div>
            {/if}

            <!-- Navigation Buttons -->
            <div class="flex justify-between mt-8 pt-6 border-t border-gray-100 dark:border-gray-700">
                {#if currentStep > 1}
                    <button type="button" onclick={prev} class="flex items-center gap-2 px-6 py-3 rounded-xl font-medium transition-colors text-gray-700 dark:text-gray-300 bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600">
                        <ArrowLeft class="w-5 h-5" /> ກັບຄືນ
                    </button>
                {:else}
                    <div></div>
                {/if}

                {#if currentStep < totalSteps}
                    <button type="button" onclick={next} class="flex items-center gap-2 px-6 py-3 rounded-xl font-medium text-white transition-colors bg-primary-600 hover:bg-primary-700">
                        ຕໍ່ໄປ <ArrowRight class="w-5 h-5" />
                    </button>
                {:else}
                    <button type="button" onclick={handleSubmit} disabled={isLoading} class="flex items-center gap-2 px-6 py-3 rounded-xl font-medium text-white transition-colors bg-primary-600 hover:bg-primary-700 disabled:opacity-50 disabled:cursor-not-allowed">
                        {#if isLoading}
                            <Loader2 class="w-5 h-5 animate-spin" /> ກຳລັງສົ່ງ...
                        {:else}
                            <Check class="w-5 h-5" /> ສົ່ງຄຳຮ້ອງ
                        {/if}
                    </button>
                {/if}
            </div>
        </div>
        {/if}

        <!-- Footer -->
        <p class="text-center text-primary-100 text-sm mt-6">
            &copy; 2026 KPOS - Enterprise POS System
        </p>
    </div>
</div>
