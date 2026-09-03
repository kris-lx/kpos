<script lang="ts">
    import { onMount, onDestroy } from "svelte";
    import { cn } from "$utils";
    import { api } from "$api";
    import { t } from "$lib/i18n/index.svelte";
    import QRCode from "qrcode";
    import {
        Store,
        ShoppingCart,
        Clock,
        Check,
        CreditCard,
        Package,
    } from "lucide-svelte";

    // Display settings
    let displaySettings = $state({
        theme: "dark" as "dark" | "light",
        showLogo: true,
        showClock: true,
        showPromotions: true,
        showQR: true,
        // 'gateway' = live per-transaction QR from a connected payment
        // gateway (broadcast in currentTransaction.qrImageDataUrl while a
        // sale is being paid). 'image'/'emv' are a static QR the owner set
        // once in Settings > Display (a bank/mobile-money QR most shops
        // already have) — shown once checkout completes so the customer has
        // time to scan, no gateway integration required.
        paymentQrMode: "gateway" as "gateway" | "image" | "emv",
        paymentQrImage: "",
        paymentQrEmvCode: "",
        fontSize: "large" as "small" | "medium" | "large",
        accentColor: "#3b82f6",
        currency: "₭",
        storeName: "",
        storeSlogan: "",
    });

    // Rendered once from paymentQrEmvCode (not on every render) — only
    // regenerated when the configured EMV string actually changes.
    let staticEmvQrImage = $state("");

    // Current transaction data (received from POS via BroadcastChannel)
    let currentTransaction = $state<{
        items: Array<{
            id: string;
            name: string;
            image?: string | null;
            quantity: number;
            price: number;
            total: number;
        }>;
        subtotal: number;
        discount: number;
        tax: number;
        total: number;
        customerName?: string;
        paymentMethod?: string;
        change?: number;
        qrImageDataUrl?: string;
        status: "idle" | "active" | "payment" | "complete";
    }>({
        items: [],
        subtotal: 0,
        discount: 0,
        tax: 0,
        total: 0,
        status: "idle",
    });

    // 'gateway' is a live, per-transaction QR that only exists while the
    // gateway payment is pending — it must disappear once the sale is
    // complete (that QR is now dead/expired). The static 'image'/'emv' modes
    // are the opposite: they're the store's fixed payment QR, meant to
    // linger through and after checkout completes so the customer has time
    // to scan it.
    //
    // "gateway" is also the mode's default with nothing ever explicitly
    // saved to Settings > Display — the common case for a store that never
    // visited that page at all. If no gateway is configured (no dynamic QR
    // will ever arrive for a non-QR sale) but a static QR image/EMV code
    // *is* set on Settings > Payments, prefer showing that instead of
    // silently showing nothing — most shops just want "show my QR after
    // checkout" without knowing this mode selector exists.
    const staticQrFallback = $derived(displaySettings.paymentQrImage || staticEmvQrImage);
    const activePaymentQrImage = $derived(
        displaySettings.paymentQrMode === "image" ? displaySettings.paymentQrImage
        : displaySettings.paymentQrMode === "emv" ? staticEmvQrImage
        : currentTransaction.qrImageDataUrl || staticQrFallback
    );
    const usingStaticFallback = $derived(displaySettings.paymentQrMode === "gateway" && !currentTransaction.qrImageDataUrl && !!staticQrFallback);
    const showPaymentQrBlock = $derived(
        displaySettings.showQR && !!activePaymentQrImage &&
        (displaySettings.paymentQrMode === "gateway" && !usingStaticFallback
            ? currentTransaction.status === "payment"
            : currentTransaction.status === "payment" || currentTransaction.status === "complete")
    );

    let promotions = $state<Array<{ id: string; title: string; description?: string }>>([]);

    const COMPLETE_HOLD_MS = 8000;
    let completeHoldUntil = 0;

    let currentTime = $state(new Date());
    let currentPromoIndex = $state(0);
    let timeInterval: ReturnType<typeof setInterval>;
    let promoInterval: ReturnType<typeof setInterval>;
    let channel: BroadcastChannel | null = null;

    async function loadDisplayData() {
        try {
            const [settingsRes, receiptRes, promotionsRes] = await Promise.all([
                api.get("settings/category/display").json<any>(),
                api.get("settings/category/receipt").json<any>(),
                api.get("promotions?limit=10").json<any>(),
            ]);

            // The static payment QR image is configured once on
            // Settings > Payments (category 'receipt', key 'qrImage') — the
            // same image printed on receipts — not duplicated into
            // display_config, so it stays in sync with what's on paper.
            const receiptRows: any[] = Array.isArray(receiptRes.data) ? receiptRes.data : [];
            displaySettings.paymentQrImage = receiptRows.find((r: any) => r.key === "qrImage")?.value || "";

            const rows: any[] = Array.isArray(settingsRes.data) ? settingsRes.data : [];
            const displayConfig = rows.find((row: any) => row.key === "display_config")?.value;
            const parsedConfig = typeof displayConfig === "string" ? JSON.parse(displayConfig) : displayConfig;
            // The settings/display admin page stores its (richer) config
            // nested under customerDisplay.* rather than as flat top-level
            // fields — bridge the fields this page actually renders from
            // there instead of spreading the raw object (which would just
            // add unused `mode`/`customerDisplay`/`posDisplay` keys with no
            // effect and silently leave showLogo/accentColor/showQR at their
            // hardcoded defaults regardless of what the owner configured).
            const cd = parsedConfig?.customerDisplay;
            if (cd) {
                displaySettings = {
                    ...displaySettings,
                    showLogo: cd.showLogo ?? displaySettings.showLogo,
                    accentColor: cd.accentColor ?? displaySettings.accentColor,
                    fontSize: cd.fontSize ?? displaySettings.fontSize,
                    showQR: cd.showPaymentQr ?? displaySettings.showQR,
                    paymentQrMode: cd.paymentQrMode ?? displaySettings.paymentQrMode,
                    paymentQrEmvCode: cd.paymentQrEmvCode ?? displaySettings.paymentQrEmvCode,
                };
                if (displaySettings.paymentQrMode === "emv" && displaySettings.paymentQrEmvCode) {
                    try {
                        staticEmvQrImage = await QRCode.toDataURL(displaySettings.paymentQrEmvCode, { width: 240, margin: 1 });
                    } catch {
                        staticEmvQrImage = "";
                    }
                }
            }

            promotions = (promotionsRes.data || [])
                .filter((promo: any) => promo.isActive !== false)
                .map((promo: any) => ({
                    id: String(promo.id),
                    title: promo.name,
                    description: promo.description,
                }));
        } catch (error) {
            console.error("Failed to load customer display data:", error);
            promotions = [];
        }
    }

    onMount(() => {
        loadDisplayData();

        // Update clock
        timeInterval = setInterval(() => {
            currentTime = new Date();
        }, 1000);

        // Rotate promotions
        promoInterval = setInterval(() => {
            if (promotions.length > 0) {
                currentPromoIndex = (currentPromoIndex + 1) % promotions.length;
            }
        }, 5000);

        // Listen for POS updates via BroadcastChannel
        if (typeof BroadcastChannel !== "undefined") {
            channel = new BroadcastChannel("kpos_customer_display");
            channel.onmessage = (event) => {
                if (event.data.type === "transaction_update") {
                    // The POS calls cart.clear() immediately after
                    // broadcasting "complete" (for the next sale), which
                    // fires its own cart-sync effect broadcasting "idle" a
                    // moment later — without this guard, the completed-sale
                    // screen (and the static payment QR the customer is
                    // meant to scan) would flash for a fraction of a second
                    // and vanish. Hold "complete" for a few seconds and
                    // ignore a same-tick idle/active follow-up.
                    const incoming = event.data.payload;
                    if (Date.now() < completeHoldUntil && (incoming.status === "idle" || incoming.status === "active")) {
                        return;
                    }
                    if (incoming.status === "complete") {
                        completeHoldUntil = Date.now() + COMPLETE_HOLD_MS;
                        // No further broadcast is guaranteed once the hold
                        // window ends (the next customer may not touch the
                        // cart right away) — force the return to idle so the
                        // screen doesn't stay stuck showing a finished sale.
                        setTimeout(() => {
                            if (currentTransaction.status === "complete") {
                                currentTransaction = { ...currentTransaction, status: "idle", qrImageDataUrl: "" };
                            }
                        }, COMPLETE_HOLD_MS);
                    } else if (incoming.status) {
                        completeHoldUntil = 0;
                    }
                    // Shallow-merge, not replace — the POS side sends
                    // lightweight partial updates for the QR code alone
                    // (generated well before checkout is confirmed, while
                    // the customer is expected to scan it) separately from
                    // the full cart/totals broadcast; a full replace would
                    // wipe whichever one arrived first.
                    currentTransaction = { ...currentTransaction, ...incoming };
                }
                if (event.data.type === "settings_update") {
                    displaySettings = {
                        ...displaySettings,
                        ...event.data.payload,
                    };
                }
            };
        }
    });

    onDestroy(() => {
        if (timeInterval) clearInterval(timeInterval);
        if (promoInterval) clearInterval(promoInterval);
        if (channel) channel.close();
    });

    function formatCurrency(amount: number): string {
        return (
            new Intl.NumberFormat("lo-LA").format(amount) +
            displaySettings.currency
        );
    }

    function formatTime(date: Date): string {
        return date.toLocaleTimeString("lo-LA", {
            hour: "2-digit",
            minute: "2-digit",
            second: "2-digit",
        });
    }

    function formatDate(date: Date): string {
        return date.toLocaleDateString("lo-LA", {
            weekday: "long",
            year: "numeric",
            month: "long",
            day: "numeric",
        });
    }

    const fontSizeClasses = $derived({
        small: "text-sm",
        medium: "text-base",
        large: "text-lg",
    });
</script>

<svelte:head>
    <title>Customer Display - KPOS</title>
    <style>
        body {
            overflow: hidden;
            cursor: none;
        }
    </style>
</svelte:head>

<div
    class={cn(
        "min-h-screen w-full flex flex-col",
        displaySettings.theme === "dark"
            ? "bg-linear-to-br from-gray-900 via-gray-800 to-gray-900 text-white"
            : "bg-linear-to-br from-blue-50 via-white to-blue-50 text-gray-900",
    )}
>
    <!-- Header -->
    <header
        class={cn(
            "flex items-center justify-between px-8 py-4",
            displaySettings.theme === "dark"
                ? "bg-gray-900/80 border-b border-gray-700"
                : "bg-white/80 border-b border-gray-200",
            "backdrop-blur-lg",
        )}
    >
        <!-- Logo & Store Name -->
        <div class="flex items-center gap-4">
            {#if displaySettings.showLogo}
                <div
                    class="w-16 h-16 rounded-2xl flex items-center justify-center text-white shadow-lg"
                    style="background: linear-gradient(135deg, {displaySettings.accentColor}, {displaySettings.accentColor}99)"
                >
                    <Store class="w-8 h-8" />
                </div>
            {/if}
            <div>
                <h1 class="text-3xl font-bold">{displaySettings.storeName}</h1>
                <p
                    class={cn(
                        "text-lg",
                        displaySettings.theme === "dark"
                            ? "text-gray-400"
                            : "text-gray-500",
                    )}
                >
                    {displaySettings.storeSlogan}
                </p>
            </div>
        </div>

        <!-- Clock -->
        {#if displaySettings.showClock}
            <div class="text-right">
                <p class="text-4xl font-mono font-bold">
                    {formatTime(currentTime)}
                </p>
                <p
                    class={cn(
                        "text-sm",
                        displaySettings.theme === "dark"
                            ? "text-gray-400"
                            : "text-gray-500",
                    )}
                >
                    {formatDate(currentTime)}
                </p>
            </div>
        {/if}
    </header>

    <!-- Main Content -->
    <main class="flex-1 flex overflow-hidden">
        {#if currentTransaction.status === "idle"}
            <!-- Idle State: Show Promotions -->
            <div class="flex-1 flex items-center justify-center p-8">
                {#if displaySettings.showPromotions}
                    <div class="text-center max-w-2xl">
                        <div
                            class={cn(
                                "w-32 h-32 mx-auto mb-8 rounded-full flex items-center justify-center",
                                displaySettings.theme === "dark"
                                    ? "bg-gray-800"
                                    : "bg-gray-100",
                            )}
                        >
                            <ShoppingCart class="w-16 h-16 text-gray-400" />
                        </div>
                        <h2 class="text-4xl font-bold mb-4">{t('display.welcome')}</h2>
                        <p
                            class={cn(
                                "text-xl",
                                displaySettings.theme === "dark"
                                    ? "text-gray-400"
                                    : "text-gray-500",
                            )}
                        >{t("display.waitForScan")}</p>

                        <!-- Promotion Carousel -->
                        {#if promotions.length > 0}
                        <div class="mt-12">
                            <div
                                class={cn(
                                    "p-8 rounded-3xl",
                                    displaySettings.theme === "dark"
                                        ? "bg-gray-800/50"
                                        : "bg-white shadow-lg",
                                )}
                            >
                                <h3
                                    class="text-2xl font-bold mb-2"
                                    style="color: {displaySettings.accentColor}"
                                >
                                    {promotions[currentPromoIndex].title}
                                </h3>
                                <p
                                    class={cn(
                                        "text-lg",
                                        displaySettings.theme === "dark"
                                            ? "text-gray-400"
                                            : "text-gray-600",
                                    )}
                                >
                                    {promotions[currentPromoIndex].description}
                                </p>
                            </div>
                            <!-- Dots -->
                            <div class="flex justify-center gap-2 mt-4">
                                {#each promotions as _, i}
                                    <div
                                        class={cn(
                                            "w-2 h-2 rounded-full transition-all",
                                            i === currentPromoIndex
                                                ? "w-8"
                                                : "",
                                        )}
                                        style="background: {i ===
                                        currentPromoIndex
                                            ? displaySettings.accentColor
                                            : displaySettings.theme === 'dark'
                                              ? '#4b5563'
                                              : '#d1d5db'}"
                                    ></div>
                                {/each}
                            </div>
                        </div>
                        {/if}
                    </div>
                {/if}
            </div>
        {:else}
            <!-- Active Transaction -->
            <div class="flex-1 flex">
                <!-- Items List -->
                <div
                    class={cn(
                        "flex-1 flex flex-col",
                        displaySettings.theme === "dark"
                            ? "bg-gray-800/30"
                            : "bg-white/50",
                    )}
                >
                    <!-- Items Header -->
                    <div
                        class={cn(
                            "flex items-center justify-between px-8 py-4 border-b",
                            displaySettings.theme === "dark"
                                ? "border-gray-700 bg-gray-800/50"
                                : "border-gray-200 bg-gray-50",
                        )}
                    >
                        <h2 class="text-xl font-bold flex items-center gap-2">
                            <ShoppingCart class="w-6 h-6" />
                            {t("display.productItems")}
                        </h2>
                        <span
                            class={cn(
                                "text-sm px-3 py-1 rounded-full",
                                displaySettings.theme === "dark"
                                    ? "bg-gray-700"
                                    : "bg-gray-200",
                            )}
                        >
                            {currentTransaction.items.length} {t("common.items")}
                        </span>
                    </div>

                    <!-- Items List -->
                    <div class="flex-1 overflow-y-auto p-4">
                        <div class="space-y-3">
                            {#each currentTransaction.items as item, index}
                                <div
                                    class={cn(
                                        "flex items-center justify-between p-4 rounded-xl transition-all",
                                        displaySettings.theme === "dark"
                                            ? "bg-gray-800/50 hover:bg-gray-800"
                                            : "bg-white hover:shadow-md",
                                        fontSizeClasses[
                                            displaySettings.fontSize
                                        ],
                                    )}
                                    style="animation: slideIn 0.3s ease-out {index *
                                        0.1}s both"
                                >
                                    <div class="flex items-center gap-4">
                                        <!-- Product Image -->
                                        {#if item.image}
                                            <img 
                                                src={item.image} 
                                                alt={item.name}
                                                class="w-16 h-16 rounded-lg object-cover shadow-md"
                                            />
                                        {:else}
                                            <div
                                                class={cn(
                                                    "w-16 h-16 rounded-lg flex items-center justify-center",
                                                    displaySettings.theme === "dark"
                                                        ? "bg-gray-700"
                                                        : "bg-gray-200",
                                                )}
                                            >
                                                <Package class="w-8 h-8 text-gray-400" />
                                            </div>
                                        {/if}
                                        <!-- Quantity Badge -->
                                        <span
                                            class={cn(
                                                "w-10 h-10 rounded-full flex items-center justify-center font-bold text-lg",
                                                displaySettings.theme === "dark"
                                                    ? "bg-gray-700"
                                                    : "bg-gray-100",
                                            )}
                                            style="background: {displaySettings.accentColor}20; color: {displaySettings.accentColor}"
                                        >
                                            {item.quantity}
                                        </span>
                                        <div class="flex flex-col">
                                            <span class="font-semibold text-lg">
                                                {item.name}
                                            </span>
                                            <span class={cn(
                                                "text-sm",
                                                displaySettings.theme === "dark" ? "text-gray-400" : "text-gray-500"
                                            )}>
                                                {formatCurrency(item.price)} x {item.quantity}
                                            </span>
                                        </div>
                                    </div>
                                    <span class="font-bold text-2xl" style="color: {displaySettings.accentColor}">
                                        {formatCurrency(item.total)}
                                    </span>
                                </div>
                            {/each}
                        </div>
                    </div>
                </div>

                <!-- Summary Panel -->
                <div
                    class={cn(
                        "w-96 flex flex-col p-6",
                        displaySettings.theme === "dark"
                            ? "bg-gray-900/80"
                            : "bg-gray-50",
                    )}
                >
                    <!-- Summary -->
                    <div class="flex-1">
                        <div class="space-y-4">
                            <div class="flex justify-between text-lg">
                                <span
                                    class={displaySettings.theme === "dark"
                                        ? "text-gray-400"
                                        : "text-gray-600"}>{t("pos.subtotal")}</span
                                >
                                <span
                                    >{formatCurrency(
                                        currentTransaction.subtotal,
                                    )}</span
                                >
                            </div>
                            {#if currentTransaction.discount > 0}
                                <div
                                    class="flex justify-between text-lg text-success-500"
                                >
                                    <span>{t("pos.discount")}</span>
                                    <span
                                        >-{formatCurrency(
                                            currentTransaction.discount,
                                        )}</span
                                    >
                                </div>
                            {/if}
                            {#if currentTransaction.tax > 0}
                                <div class="flex justify-between text-lg">
                                    <span
                                        class={displaySettings.theme === "dark"
                                            ? "text-gray-400"
                                            : "text-gray-600"}>{t("documents.tax")} (VAT)</span
                                    >
                                    <span
                                        >{formatCurrency(
                                            currentTransaction.tax,
                                        )}</span
                                    >
                                </div>
                            {/if}
                        </div>

                        <hr
                            class={cn(
                                "my-6",
                                displaySettings.theme === "dark"
                                    ? "border-gray-700"
                                    : "border-gray-300",
                            )}
                        />

                        <!-- Total -->
                        <div class="text-center">
                            <p
                                class={cn(
                                    "text-lg mb-2",
                                    displaySettings.theme === "dark"
                                        ? "text-gray-400"
                                        : "text-gray-600",
                                )}
                            >
                                {t("display.paymentAmount")}
                            </p>
                            <p
                                class="text-5xl font-bold"
                                style="color: {displaySettings.accentColor}"
                            >
                                {formatCurrency(currentTransaction.total)}
                            </p>
                        </div>
                    </div>

                    <!-- Payment Status -->
                    {#if currentTransaction.status === "payment"}
                        <div
                            class={cn(
                                "mt-6 p-6 rounded-2xl text-center",
                                displaySettings.theme === "dark"
                                    ? "bg-yellow-500/20"
                                    : "bg-yellow-50",
                            )}
                        >
                            <CreditCard
                                class="w-12 h-12 mx-auto mb-3 text-yellow-500"
                            />
                            <p class="text-xl font-bold text-yellow-500">
                                {t("display.processingPayment")}
                            </p>
                        </div>
                    {:else if currentTransaction.status === "complete"}
                        <div
                            class={cn(
                                "mt-6 p-6 rounded-2xl text-center",
                                displaySettings.theme === "dark"
                                    ? "bg-success-500/20"
                                    : "bg-success-50",
                            )}
                        >
                            <Check
                                class="w-12 h-12 mx-auto mb-3 text-success-500"
                            />
                            <p class="text-xl font-bold text-success-500">
                                {t("pos.paymentSuccess")}
                            </p>
                            {#if currentTransaction.change}
                                <p
                                    class={cn(
                                        "mt-2",
                                        displaySettings.theme === "dark"
                                            ? "text-gray-400"
                                            : "text-gray-600",
                                    )}
                                >
                                    {t("pos.change")}: {formatCurrency(
                                        currentTransaction.change,
                                    )}
                                </p>
                            {/if}
                        </div>
                    {/if}

                    <!-- Payment QR Code — either a live gateway QR (JDB Yes
                         Pay / Alipay / WeChat) broadcast from the POS the
                         moment the cashier generates it, or the store's own
                         static bank/mobile-money QR configured once in
                         Settings > Display (image upload or EMV code) that
                         persists through checkout completion. Mode and
                         on/off are both set by the store owner or a staff
                         member granted settings:update. Never a fake
                         placeholder — only rendered when a real QR image
                         actually exists. -->
                    {#if showPaymentQrBlock}
                        <div
                            class={cn(
                                "mt-6 p-4 rounded-xl text-center",
                                displaySettings.theme === "dark"
                                    ? "bg-gray-800"
                                    : "bg-white",
                            )}
                        >
                            <img
                                src={activePaymentQrImage}
                                alt={t("pos.scanQrToPay")}
                                class="w-40 h-40 mx-auto bg-white rounded-lg p-2"
                            />
                            <p
                                class={cn(
                                    "mt-2 text-sm",
                                    displaySettings.theme === "dark"
                                        ? "text-gray-400"
                                        : "text-gray-600",
                                )}
                            >
                                {t("pos.scanQrToPay")}
                            </p>
                        </div>
                    {/if}
                </div>
            </div>
        {/if}
    </main>

    <!-- Footer -->
    <footer
        class={cn(
            "px-8 py-3 text-center text-sm",
            displaySettings.theme === "dark"
                ? "bg-gray-900/80 text-gray-500"
                : "bg-white/80 text-gray-400",
        )}
    >
        Powered by KPOS - Enterprise POS System
    </footer>
</div>

<style>
    @keyframes slideIn {
        from {
            opacity: 0;
            transform: translateX(-20px);
        }
        to {
            opacity: 1;
            transform: translateX(0);
        }
    }
</style>
