<script lang="ts">
    import { onMount } from "svelte";
    import { cn } from "$utils";
    import { t } from "$lib/i18n/index.svelte";
    import { toast } from "svelte-sonner";
    import {
        Monitor,
        MonitorOff,
        Maximize2,
        Settings,
        Save,
        Eye,
        EyeOff,
        ExternalLink,
        RefreshCw,
        Tv,
        Laptop,
        Tablet,
        Smartphone,
        Check,
        X,
        Palette,
        Image,
        Type,
        Layout,
        AlertCircle,
        Info,
        Loader2,
        Sun,
        Moon,
    } from "lucide-svelte";

    // Display configuration
    let config = $state({
        enabled: true,
        mode: "dual" as "single" | "dual",
        customerDisplay: {
            enabled: true,
            url: "/display/customer",
            autoOpen: false,
            position: "right" as "left" | "right" | "top" | "bottom",
            width: 1920,
            height: 1080,
            showBranding: true,
            showLogo: true,
            backgroundColor: "#1a1a2e",
            textColor: "#ffffff",
            accentColor: "#3b82f6",
            idleMessage: "ຍິນດີຕ້ອນຮັບ",
            showPrices: true,
            showItemImages: true,
            fontSize: "medium" as "small" | "medium" | "large",
            animation: "slide" as "none" | "slide" | "fade" | "bounce",
        },
        posDisplay: {
            width: 1920,
            height: 1080,
            position: "left" as "left" | "right",
        },
    });

    let isCustomerDisplayOpen = $state(false);
    let customerDisplayWindow: Window | null = null;
    let showPreview = $state(false);
    let isSaving = $state(false);
    let saveSuccess = $state(false);

    const displayModes = [
        {
            id: "single",
            name: "ຈໍດຽວ",
            description: "ໃຊ້ຈໍດຽວສຳລັບ POS",
            icon: Laptop,
        },
        {
            id: "dual",
            name: "ສອງຈໍ",
            description: "ຈໍ POS + ຈໍລູກຄ້າ",
            icon: Tv,
        },
    ];

    const positions = [
        { id: "left", name: "ຊ້າຍ" },
        { id: "right", name: "ຂວາ" },
        { id: "top", name: "ເທິງ" },
        { id: "bottom", name: "ລຸ່ມ" },
    ];

    const fontSizes = [
        { id: "small", name: "ນ້ອຍ", size: "14px" },
        { id: "medium", name: "ກາງ", size: "18px" },
        { id: "large", name: "ໃຫຍ່", size: "24px" },
    ];

    const animations = [
        { id: "none", name: "ບໍ່ມີ" },
        { id: "slide", name: "ເລື່ອນ" },
        { id: "fade", name: "ຈາງ" },
        { id: "bounce", name: "ເດັ້ງ" },
    ];

    const resolutions = [
        { width: 1920, height: 1080, name: "Full HD (1920x1080)" },
        { width: 1366, height: 768, name: "HD (1366x768)" },
        { width: 1280, height: 720, name: "720p (1280x720)" },
        { width: 1024, height: 768, name: "XGA (1024x768)" },
        { width: 800, height: 600, name: "SVGA (800x600)" },
    ];

    onMount(() => {
        // Load saved configuration
        const savedConfig = localStorage.getItem("kpos_display_config");
        if (savedConfig) {
            try {
                const parsed = JSON.parse(savedConfig);
                config = { ...config, ...parsed };
            } catch (e) {
                console.error("Failed to parse display config:", e);
            }
        }

        // Check if customer display window is already open
        if (window.opener && window.location.pathname === "/display/customer") {
            isCustomerDisplayOpen = true;
        }

        return () => {
            // Cleanup
            if (customerDisplayWindow && !customerDisplayWindow.closed) {
                // Don't close automatically, just update state
            }
        };
    });

    function openCustomerDisplay() {
        if (customerDisplayWindow && !customerDisplayWindow.closed) {
            customerDisplayWindow.focus();
            return;
        }

        const { width, height, position } = config.customerDisplay;
        let left = 0;
        let top = 0;

        // Calculate position based on configuration
        if (position === "right") {
            left = window.screen.width;
        } else if (position === "left") {
            left = -width;
        }

        const features = `width=${width},height=${height},left=${left},top=${top},menubar=no,toolbar=no,location=no,status=no`;

        customerDisplayWindow = window.open(
            config.customerDisplay.url,
            "customer_display",
            features,
        );

        if (customerDisplayWindow) {
            isCustomerDisplayOpen = true;

            // Check if window is closed
            const checkClosed = setInterval(() => {
                if (customerDisplayWindow?.closed) {
                    isCustomerDisplayOpen = false;
                    clearInterval(checkClosed);
                }
            }, 1000);
        }
    }

    function closeCustomerDisplay() {
        if (customerDisplayWindow && !customerDisplayWindow.closed) {
            customerDisplayWindow.close();
        }
        isCustomerDisplayOpen = false;
    }

    function refreshCustomerDisplay() {
        if (customerDisplayWindow && !customerDisplayWindow.closed) {
            customerDisplayWindow.location.reload();
        }
    }

    async function saveConfig() {
        isSaving = true;
        try {
            // Save to localStorage
            localStorage.setItem("kpos_display_config", JSON.stringify(config));

            // TODO: Also save to backend
            // await fetch('/api/v1/settings/display', {
            //     method: 'PUT',
            //     headers: { 'Content-Type': 'application/json' },
            //     body: JSON.stringify(config)
            // });

            saveSuccess = true;
            toast.success("ບັນທຶກການຕັ້ງຄ່າສຳເລັດ");
            setTimeout(() => {
                saveSuccess = false;
            }, 3000);
        } catch (error) {
            console.error("Failed to save config:", error);
            toast.error("ບັນທຶກບໍ່ສຳເລັດ");
        } finally {
            isSaving = false;
        }
    }

    function setResolution(
        target: "customer" | "pos",
        resolution: { width: number; height: number },
    ) {
        if (target === "customer") {
            config.customerDisplay.width = resolution.width;
            config.customerDisplay.height = resolution.height;
        } else {
            config.posDisplay.width = resolution.width;
            config.posDisplay.height = resolution.height;
        }
    }
</script>

<svelte:head>
    <title>ຕັ້ງຄ່າການສະແດງ | KPOS</title>
</svelte:head>

<div class="min-h-screen bg-gray-50 dark:bg-gray-900 p-6">
    <!-- Header -->
    <div class="mb-6">
        <div class="flex items-center justify-between">
            <div>
                <h1
                    class="text-2xl font-bold text-gray-900 dark:text-white flex items-center gap-3"
                >
                    <Monitor class="w-7 h-7 text-primary-500" />
                    ຕັ້ງຄ່າການສະແດງ
                </h1>
                <p class="text-gray-500 dark:text-gray-400 mt-1">
                    ຕັ້ງຄ່າຈໍ POS ແລະ ຈໍສະແດງລູກຄ້າ
                </p>
            </div>
            <button
                onclick={saveConfig}
                disabled={isSaving}
                class={cn(
                    "flex items-center gap-2 px-4 py-2 rounded-lg font-medium transition-all",
                    saveSuccess
                        ? "bg-green-500 text-white"
                        : "bg-primary-500 hover:bg-primary-600 text-white",
                    isSaving && "opacity-50 cursor-not-allowed",
                )}
            >
                {#if isSaving}
                    <RefreshCw class="w-5 h-5 animate-spin" />
                    ກຳລັງບັນທຶກ...
                {:else if saveSuccess}
                    <Check class="w-5 h-5" />
                    ບັນທຶກແລ້ວ!
                {:else}
                    <Save class="w-5 h-5" />
                    ບັນທຶກ
                {/if}
            </button>
        </div>
    </div>

    <div class="grid grid-cols-1 xl:grid-cols-3 gap-6">
        <!-- Left: Configuration -->
        <div class="xl:col-span-2 space-y-6">
            <!-- Display Mode -->
            <div
                class="bg-white dark:bg-gray-800 rounded-xl shadow-sm p-6"
            >
                <h2
                    class="text-lg font-semibold text-gray-900 dark:text-white mb-4 flex items-center gap-2"
                >
                    <Layout class="w-5 h-5" />
                    ໂໝດການສະແດງ
                </h2>
                <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    {#each displayModes as mode}
                        <button
                            onclick={() =>
                                (config.mode = mode.id as "single" | "dual")}
                            class={cn(
                                "p-4 rounded-xl border-2 transition-all text-left",
                                config.mode === mode.id
                                    ? "border-primary-500 bg-primary-50 dark:bg-primary-900/20"
                                    : "border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600",
                            )}
                        >
                            <div class="flex items-start gap-3">
                                <div
                                    class={cn(
                                        "p-3 rounded-lg",
                                        config.mode === mode.id
                                            ? "bg-primary-100 dark:bg-primary-900/30 text-primary-600"
                                            : "bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300",
                                    )}
                                >
                                    <mode.icon class="w-6 h-6" />
                                </div>
                                <div>
                                    <h3
                                        class={cn(
                                            "font-medium",
                                            config.mode === mode.id
                                                ? "text-primary-600 dark:text-primary-400"
                                                : "text-gray-900 dark:text-white",
                                        )}
                                    >
                                        {mode.name}
                                    </h3>
                                    <p
                                        class="text-sm text-gray-500 dark:text-gray-400"
                                    >
                                        {mode.description}
                                    </p>
                                </div>
                            </div>
                        </button>
                    {/each}
                </div>
            </div>

            <!-- Customer Display Settings -->
            {#if config.mode === "dual"}
                <div
                    class="bg-white dark:bg-gray-800 rounded-xl shadow-sm p-6"
                >
                    <div class="flex items-center justify-between mb-6">
                        <h2
                            class="text-lg font-semibold text-gray-900 dark:text-white flex items-center gap-2"
                        >
                            <Tv class="w-5 h-5" />
                            ຈໍສະແດງລູກຄ້າ
                        </h2>
                        <label class="flex items-center gap-3 cursor-pointer">
                            <span
                                class="text-sm text-gray-600 dark:text-gray-400"
                                >ເປີດໃຊ້ງານ</span
                            >
                            <div class="relative">
                                <input
                                    type="checkbox"
                                    bind:checked={
                                        config.customerDisplay.enabled
                                    }
                                    class="sr-only peer"
                                />
                                <div
                                    class="w-11 h-6 bg-gray-200 dark:bg-gray-700 peer-focus:ring-4 peer-focus:ring-primary-300 dark:peer-focus:ring-primary-800 rounded-full peer peer-checked:after:translate-x-full peer-checked:bg-primary-500 after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all"
                                ></div>
                            </div>
                        </label>
                    </div>

                    {#if config.customerDisplay.enabled}
                        <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
                            <!-- Resolution -->
                            <div>
                                <label
                                    for="customer-resolution"
                                    class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2"
                                    >ຄວາມລະອຽດ</label
                                >
                                <select
                                    id="customer-resolution"
                                    onchange={(e) => {
                                        const [w, h] = e.currentTarget.value
                                            .split("x")
                                            .map(Number);
                                        setResolution("customer", {
                                            width: w,
                                            height: h,
                                        });
                                    }}
                                    class="w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-white px-4 py-2.5"
                                >
                                    {#each resolutions as res}
                                        <option
                                            value="{res.width}x{res.height}"
                                            selected={config.customerDisplay
                                                .width === res.width &&
                                                config.customerDisplay
                                                    .height === res.height}
                                        >
                                            {res.name}
                                        </option>
                                    {/each}
                                </select>
                            </div>

                            <!-- Position -->
                            <div>
                                <label
                                    for="customer-position"
                                    class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2"
                                    >ຕຳແໜ່ງຈໍ</label
                                >
                                <select
                                    id="customer-position"
                                    bind:value={config.customerDisplay.position}
                                    class="w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-white px-4 py-2.5"
                                >
                                    {#each positions as pos}
                                        <option value={pos.id}
                                            >{pos.name}</option
                                        >
                                    {/each}
                                </select>
                            </div>

                            <!-- Font Size -->
                            <div>
                                <label
                                    for="font-size"
                                    class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2"
                                    >ຂະໜາດຕົວໜັງສື</label
                                >
                                <select
                                    id="font-size"
                                    bind:value={config.customerDisplay.fontSize}
                                    class="w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-white px-4 py-2.5"
                                >
                                    {#each fontSizes as size}
                                        <option value={size.id}
                                            >{size.name}</option
                                        >
                                    {/each}
                                </select>
                            </div>

                            <!-- Animation -->
                            <div>
                                <label
                                    for="animation"
                                    class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2"
                                    >ເອັບເຟັກ</label
                                >
                                <select
                                    id="animation"
                                    bind:value={
                                        config.customerDisplay.animation
                                    }
                                    class="w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-white px-4 py-2.5"
                                >
                                    {#each animations as anim}
                                        <option value={anim.id}
                                            >{anim.name}</option
                                        >
                                    {/each}
                                </select>
                            </div>

                            <!-- Background Color -->
                            <div>
                                <label
                                    for="bg-color"
                                    class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2"
                                    >ສີພື້ນຫລັງ</label
                                >
                                <div class="flex gap-2">
                                    <input
                                        id="bg-color"
                                        type="color"
                                        bind:value={
                                            config.customerDisplay
                                                .backgroundColor
                                        }
                                        class="w-12 h-10 rounded-lg border border-gray-300 dark:border-gray-600 cursor-pointer"
                                    />
                                    <input
                                        type="text"
                                        bind:value={
                                            config.customerDisplay
                                                .backgroundColor
                                        }
                                        class="flex-1 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-white px-4 py-2"
                                    />
                                </div>
                            </div>

                            <!-- Accent Color -->
                            <div>
                                <label
                                    for="accent-color"
                                    class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2"
                                    >ສີເນັ້ນ</label
                                >
                                <div class="flex gap-2">
                                    <input
                                        id="accent-color"
                                        type="color"
                                        bind:value={
                                            config.customerDisplay.accentColor
                                        }
                                        class="w-12 h-10 rounded-lg border border-gray-300 dark:border-gray-600 cursor-pointer"
                                    />
                                    <input
                                        type="text"
                                        bind:value={
                                            config.customerDisplay.accentColor
                                        }
                                        class="flex-1 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-white px-4 py-2"
                                    />
                                </div>
                            </div>

                            <!-- Idle Message -->
                            <div class="md:col-span-2">
                                <label
                                    for="idle-message"
                                    class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2"
                                    >ຂໍ້ຄວາມເວລາວ່າງ</label
                                >
                                <input
                                    id="idle-message"
                                    type="text"
                                    bind:value={
                                        config.customerDisplay.idleMessage
                                    }
                                    placeholder="ຍິນດີຕ້ອນຮັບ"
                                    class="w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-white px-4 py-2.5"
                                />
                            </div>
                        </div>

                        <!-- Toggle Options -->
                        <div
                            class="mt-6 pt-6 border-t border-gray-200 dark:border-gray-700"
                        >
                            <h3
                                class="text-sm font-medium text-gray-700 dark:text-gray-300 mb-4"
                            >
                                ຕັ້ງຄ່າເພີ່ມເຕີມ
                            </h3>
                            <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                <label
                                    class="flex items-center gap-3 p-3 rounded-lg border border-gray-200 dark:border-gray-700 cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-700/50"
                                >
                                    <input
                                        type="checkbox"
                                        bind:checked={
                                            config.customerDisplay.showBranding
                                        }
                                        class="w-4 h-4 rounded border-gray-300 text-primary-600 focus:ring-primary-500"
                                    />
                                    <span
                                        class="text-sm text-gray-700 dark:text-gray-300"
                                        >ສະແດງ Branding</span
                                    >
                                </label>

                                <label
                                    class="flex items-center gap-3 p-3 rounded-lg border border-gray-200 dark:border-gray-700 cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-700/50"
                                >
                                    <input
                                        type="checkbox"
                                        bind:checked={
                                            config.customerDisplay.showLogo
                                        }
                                        class="w-4 h-4 rounded border-gray-300 text-primary-600 focus:ring-primary-500"
                                    />
                                    <span
                                        class="text-sm text-gray-700 dark:text-gray-300"
                                        >ສະແດງ Logo</span
                                    >
                                </label>

                                <label
                                    class="flex items-center gap-3 p-3 rounded-lg border border-gray-200 dark:border-gray-700 cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-700/50"
                                >
                                    <input
                                        type="checkbox"
                                        bind:checked={
                                            config.customerDisplay.showPrices
                                        }
                                        class="w-4 h-4 rounded border-gray-300 text-primary-600 focus:ring-primary-500"
                                    />
                                    <span
                                        class="text-sm text-gray-700 dark:text-gray-300"
                                        >ສະແດງລາຄາ</span
                                    >
                                </label>

                                <label
                                    class="flex items-center gap-3 p-3 rounded-lg border border-gray-200 dark:border-gray-700 cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-700/50"
                                >
                                    <input
                                        type="checkbox"
                                        bind:checked={
                                            config.customerDisplay
                                                .showItemImages
                                        }
                                        class="w-4 h-4 rounded border-gray-300 text-primary-600 focus:ring-primary-500"
                                    />
                                    <span
                                        class="text-sm text-gray-700 dark:text-gray-300"
                                        >ສະແດງຮູບສິນຄ້າ</span
                                    >
                                </label>

                                <label
                                    class="flex items-center gap-3 p-3 rounded-lg border border-gray-200 dark:border-gray-700 cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-700/50"
                                >
                                    <input
                                        type="checkbox"
                                        bind:checked={
                                            config.customerDisplay.autoOpen
                                        }
                                        class="w-4 h-4 rounded border-gray-300 text-primary-600 focus:ring-primary-500"
                                    />
                                    <span
                                        class="text-sm text-gray-700 dark:text-gray-300"
                                        >ເປີດອັດຕະໂນມັດ</span
                                    >
                                </label>
                            </div>
                        </div>
                    {/if}
                </div>
            {/if}

            <!-- Quick Tips -->
            <div
                class="bg-blue-50 dark:bg-blue-900/20 rounded-xl border border-blue-200 dark:border-blue-800 p-6"
            >
                <div class="flex gap-4">
                    <Info
                        class="w-6 h-6 text-blue-500 dark:text-blue-400 shrink-0"
                    />
                    <div>
                        <h3
                            class="font-medium text-blue-900 dark:text-blue-100 mb-2"
                        >
                            ຄຳແນະນຳການໃຊ້ງານ
                        </h3>
                        <ul
                            class="text-sm text-blue-700 dark:text-blue-300 space-y-2"
                        >
                            <li>• ເຊື່ອມຕໍ່ຈໍທີສອງກ່ອນເປີດໃຊ້ງານຈໍລູກຄ້າ</li>
                            <li>• ຕັ້ງຄ່າຕຳແໜ່ງຈໍໃຫ້ກົງກັບການວາງຈໍຕົວຈິງ</li>
                            <li>• ສາມາດປັບສີແລະຮູບແບບໄດ້ຕາມຕ້ອງການ</li>
                            <li>
                                • URL ຈໍລູກຄ້າ: <code
                                    class="px-2 py-1 rounded bg-blue-100 dark:bg-blue-900"
                                    >/display/customer</code
                                >
                            </li>
                        </ul>
                    </div>
                </div>
            </div>
        </div>

        <!-- Right: Preview & Controls -->
        <div class="space-y-6">
            <!-- Customer Display Control -->
            <div
                class="bg-white dark:bg-gray-800 rounded-xl shadow-sm p-6"
            >
                <h2
                    class="text-lg font-semibold text-gray-900 dark:text-white mb-4 flex items-center gap-2"
                >
                    <Tv class="w-5 h-5" />
                    ຈໍລູກຄ້າ
                </h2>

                <div class="space-y-4">
                    <!-- Status -->
                    <div
                        class={cn(
                            "flex items-center justify-between p-4 rounded-lg",
                            isCustomerDisplayOpen
                                ? "bg-green-50 dark:bg-green-900/20"
                                : "bg-gray-50 dark:bg-gray-700/50",
                        )}
                    >
                        <div class="flex items-center gap-3">
                            <div
                                class={cn(
                                    "w-3 h-3 rounded-full",
                                    isCustomerDisplayOpen
                                        ? "bg-green-500 animate-pulse"
                                        : "bg-gray-400",
                                )}
                            ></div>
                            <span
                                class={cn(
                                    "text-sm font-medium",
                                    isCustomerDisplayOpen
                                        ? "text-green-700 dark:text-green-400"
                                        : "text-gray-600 dark:text-gray-400",
                                )}
                            >
                                {isCustomerDisplayOpen
                                    ? "ກຳລັງເຊື່ອມຕໍ່"
                                    : "ບໍ່ໄດ້ເຊື່ອມຕໍ່"}
                            </span>
                        </div>
                    </div>

                    <!-- Control Buttons -->
                    <div class="grid grid-cols-2 gap-2">
                        {#if !isCustomerDisplayOpen}
                            <button
                                onclick={openCustomerDisplay}
                                disabled={!config.customerDisplay.enabled ||
                                    config.mode === "single"}
                                class="col-span-2 flex items-center justify-center gap-2 px-4 py-3 rounded-lg bg-primary-500 hover:bg-primary-600 disabled:bg-gray-300 dark:disabled:bg-gray-700 text-white disabled:text-gray-500 font-medium transition-colors"
                            >
                                <ExternalLink class="w-5 h-5" />
                                ເປີດຈໍລູກຄ້າ
                            </button>
                        {:else}
                            <button
                                onclick={refreshCustomerDisplay}
                                class="flex items-center justify-center gap-2 px-4 py-3 rounded-lg bg-blue-500 hover:bg-blue-600 text-white font-medium transition-colors"
                            >
                                <RefreshCw class="w-5 h-5" />
                                Refresh
                            </button>
                            <button
                                onclick={closeCustomerDisplay}
                                class="flex items-center justify-center gap-2 px-4 py-3 rounded-lg bg-red-500 hover:bg-red-600 text-white font-medium transition-colors"
                            >
                                <X class="w-5 h-5" />
                                ປິດ
                            </button>
                        {/if}
                    </div>

                    <!-- Preview in New Tab -->
                    <a
                        href="/display/customer"
                        target="_blank"
                        rel="noopener noreferrer"
                        class="flex items-center justify-center gap-2 px-4 py-3 rounded-lg border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 font-medium transition-colors"
                    >
                        <Eye class="w-5 h-5" />
                        ເບິ່ງຕົວຢ່າງ
                    </a>
                </div>
            </div>

            <!-- Preview -->
            <div
                class="bg-white dark:bg-gray-800 rounded-xl shadow-sm overflow-hidden"
            >
                <div
                    class="p-4 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between"
                >
                    <h2
                        class="font-semibold text-gray-900 dark:text-white flex items-center gap-2"
                    >
                        <Eye class="w-5 h-5" />
                        ຕົວຢ່າງການສະແດງ
                    </h2>
                    <button
                        onclick={() => (showPreview = !showPreview)}
                        class="text-sm text-primary-600 hover:text-primary-700"
                    >
                        {showPreview ? "ຊ່ອນ" : "ສະແດງ"}
                    </button>
                </div>

                {#if showPreview}
                    <div class="p-4">
                        <div
                            class="aspect-video rounded-lg overflow-hidden border border-gray-200 dark:border-gray-700"
                            style="background-color: {config.customerDisplay
                                .backgroundColor}"
                        >
                            <div
                                class="h-full flex flex-col items-center justify-center p-6 text-center"
                            >
                                <p
                                    class="text-2xl font-bold"
                                    style="color: {config.customerDisplay
                                        .textColor}"
                                >
                                    {config.customerDisplay.idleMessage}
                                </p>
                                <div
                                    class="mt-4 px-6 py-2 rounded-full text-sm font-medium"
                                    style="background-color: {config
                                        .customerDisplay
                                        .accentColor}; color: white"
                                >
                                    KPOS
                                </div>
                            </div>
                        </div>
                        <p
                            class="text-xs text-gray-500 dark:text-gray-400 text-center mt-2"
                        >
                            {config.customerDisplay.width} x {config
                                .customerDisplay.height}
                        </p>
                    </div>
                {/if}
            </div>

            <!-- Display Layout Diagram -->
            <div
                class="bg-white dark:bg-gray-800 rounded-xl shadow-sm p-6"
            >
                <h2
                    class="text-lg font-semibold text-gray-900 dark:text-white mb-4"
                >
                    ຮູບແບບການວາງຈໍ
                </h2>
                <div
                    class="aspect-video bg-gray-100 dark:bg-gray-700 rounded-lg p-4 flex items-center justify-center gap-4"
                >
                    {#if config.mode === "single"}
                        <div
                            class="bg-primary-500 text-white p-4 rounded-lg text-center"
                        >
                            <Laptop class="w-8 h-8 mx-auto mb-2" />
                            <span class="text-xs font-medium">POS</span>
                        </div>
                    {:else if config.customerDisplay.position === "left"}
                        <div
                            class="bg-blue-500 text-white p-4 rounded-lg text-center"
                        >
                            <Tv class="w-8 h-8 mx-auto mb-2" />
                            <span class="text-xs font-medium">ລູກຄ້າ</span>
                        </div>
                        <div
                            class="bg-primary-500 text-white p-4 rounded-lg text-center"
                        >
                            <Laptop class="w-8 h-8 mx-auto mb-2" />
                            <span class="text-xs font-medium">POS</span>
                        </div>
                    {:else}
                        <div
                            class="bg-primary-500 text-white p-4 rounded-lg text-center"
                        >
                            <Laptop class="w-8 h-8 mx-auto mb-2" />
                            <span class="text-xs font-medium">POS</span>
                        </div>
                        <div
                            class="bg-blue-500 text-white p-4 rounded-lg text-center"
                        >
                            <Tv class="w-8 h-8 mx-auto mb-2" />
                            <span class="text-xs font-medium">ລູກຄ້າ</span>
                        </div>
                    {/if}
                </div>
            </div>
        </div>
    </div>
</div>
