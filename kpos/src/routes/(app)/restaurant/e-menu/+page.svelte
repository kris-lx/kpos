<script lang="ts">
    import { onMount } from "svelte";
    import { t } from "$lib/i18n/index.svelte";
    import { cn } from "$utils";
    import { api } from "$api";
    import { formatCurrency } from "$lib/utils";
    import { toast } from "svelte-sonner";
    import { auth } from "$stores";
    import {
        Search,
        Loader2,
        RefreshCw,
        AlertCircle,
        ShoppingBag,
        Plus,
        Minus,
        X,
        Flame,
        Leaf,
        Star,
        ChefHat,
        Clock,
        Trash2,
        Send,
        UtensilsCrossed,
    } from "lucide-svelte";

    // State
    let categories = $state<any[]>([]);
    let menuItems = $state<any[]>([]);
    let selectedCategory = $state<string>("all");
    let isLoading = $state(true);
    let error = $state<string | null>(null);
    let searchQuery = $state("");
    let showItemModal = $state(false);
    let selectedItem = $state<any>(null);
    let quantity = $state(1);
    let specialRequest = $state("");
    let showCart = $state(false);
    let branchId = $state<string | null>(null);

    // Cart
    let cart = $state<any[]>([]);

    let restaurantInfo = $state({
        name: "KPOS Restaurant",
        description: t("restaurant.menuDefaultDescription"),
        logo: "",
        tableNumber: null as string | null,
        isOpen: true,
        openTime: "09:00",
        closeTime: "22:00",
    });

    // Computed
    let filteredItems = $derived(
        menuItems.filter((item) => {
            const matchCategory = selectedCategory === "all" || item.category === selectedCategory;
            const matchSearch = searchQuery === "" || 
                item.name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
                item.description?.toLowerCase().includes(searchQuery.toLowerCase());
            return matchCategory && matchSearch;
        })
    );

    let cartTotal = $derived(
        cart.reduce((acc, item) => acc + item.price * item.quantity, 0)
    );

    let cartCount = $derived(
        cart.reduce((acc, item) => acc + item.quantity, 0)
    );

    async function loadMenu() {
        isLoading = true;
        error = null;
        try {
            const params = new URLSearchParams();
            if (branchId) params.set("branchId", branchId);
            const res = await api.get(`restaurant/e-menu${branchId ? `?branchId=${branchId}` : ""}`).json<any>();
            if (res.success) {
                categories = res.data?.categories || [];
                menuItems = res.data?.items || [];
                restaurantInfo.name = res.data?.restaurant?.name || restaurantInfo.name;
            } else {
                throw new Error("Failed to load");
            }
        } catch (err) {
            console.error("Failed to load menu:", err);
            error = t("restaurant.menuLoadFailed");
            categories = [];
            menuItems = [];
        } finally {
            isLoading = false;
        }
    }

    function openItemModal(item: any) {
        if (!item.isAvailable) return;
        selectedItem = item;
        quantity = 1;
        specialRequest = "";
        showItemModal = true;
    }

    function addToCart() {
        if (!selectedItem) return;

        const existingIndex = cart.findIndex(
            (i) => i.itemId === selectedItem.id && i.specialRequest === specialRequest
        );

        if (existingIndex >= 0) {
            cart = cart.map((item, i) =>
                i === existingIndex ? { ...item, quantity: item.quantity + quantity } : item
            );
        } else {
            cart = [...cart, {
                itemId: selectedItem.id,
                name: selectedItem.name,
                price: selectedItem.price,
                image: selectedItem.image,
                category: selectedItem.category,
                quantity,
                specialRequest,
            }];
        }

        showItemModal = false;
        toast.success(t("restaurant.addedToOrder"));
    }

    function updateCartQuantity(index: number, delta: number) {
        const newQty = cart[index].quantity + delta;
        if (newQty <= 0) {
            cart = cart.filter((_, i) => i !== index);
        } else {
            cart = cart.map((item, i) =>
                i === index ? { ...item, quantity: newQty } : item
            );
        }
    }

    function removeFromCart(index: number) {
        cart = cart.filter((_, i) => i !== index);
    }

    async function submitOrder() {
        if (cart.length === 0) return;

        try {
            await api.post("restaurant/e-menu/order", {
                json: {
                    branchId: branchId || undefined,
                    tableNumber: restaurantInfo.tableNumber,
                    items: cart.map(item => ({
                        itemId: item.itemId,
                        name: item.name,
                        price: item.price,
                        quantity: item.quantity,
                        specialRequest: item.specialRequest || undefined,
                    })),
                },
            }).json();

            cart = [];
            showCart = false;
            toast.success(t("restaurant.orderPlaced"));
        } catch (err) {
            console.error("Failed to submit order:", err);
            toast.error(t("common.error"));
        }
    }

    function getCategoryIcon(categoryId: string): string {
        return categories.find((c) => c.id === categoryId)?.icon || "🍽️";
    }

    onMount(() => {
        const params = new URLSearchParams(window.location.search);
        restaurantInfo.tableNumber = params.get("table");
        branchId = params.get("branchId") || auth.activeBranchId;
        loadMenu();
    });

    // Reload when active branch changes
    $effect(() => {
        const newBranchId = auth.activeBranchId;
        if (newBranchId && newBranchId !== branchId) {
            branchId = newBranchId;
            loadMenu();
        }
    });
</script>

<svelte:head>
    <title>E-Menu - {restaurantInfo.name}</title>
</svelte:head>

<div class="min-h-screen bg-gradient-to-b from-gray-50 to-gray-100 dark:from-gray-900 dark:to-gray-950">
    <!-- Header -->
    <div class="bg-gradient-to-r from-primary-600 to-primary-700 text-white sticky top-0 z-40 shadow-lg">
        <div class="max-w-4xl mx-auto p-4">
            <div class="flex items-center justify-between mb-4">
                <div class="flex items-center gap-3">
                    <div class="p-2.5 bg-white/20 backdrop-blur rounded-xl">
                        <UtensilsCrossed class="w-6 h-6" />
                    </div>
                    <div>
                        <h1 class="text-xl font-bold">{restaurantInfo.name}</h1>
                        <p class="text-sm text-primary-100">{restaurantInfo.description}</p>
                    </div>
                </div>
                {#if restaurantInfo.tableNumber}
                    <div class="text-center px-4 py-2 bg-white/20 backdrop-blur rounded-xl">
                        <p class="text-xs text-primary-100">{t("restaurant.table")}</p>
                        <p class="text-2xl font-bold">{restaurantInfo.tableNumber}</p>
                    </div>
                {/if}
            </div>

            <!-- Search -->
            <div class="relative">
                <Search class="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                <input
                    type="text"
                    bind:value={searchQuery}
                    placeholder={t("restaurant.searchMenu")}
                    class="w-full pl-12 pr-4 py-3 rounded-2xl bg-white dark:bg-gray-800 text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-white/50 shadow-lg"
                />
            </div>
        </div>
    </div>

    <!-- Categories -->
    <div class="sticky top-[144px] z-30 bg-white/80 dark:bg-gray-800/80 backdrop-blur-lg border-b border-gray-200 dark:border-gray-700">
        <div class="max-w-4xl mx-auto">
            <div class="flex overflow-x-auto py-3 px-4 gap-2 scrollbar-hide">
                <button
                    onclick={() => (selectedCategory = "all")}
                    class={cn(
                        "px-5 py-2.5 rounded-xl whitespace-nowrap transition-all font-medium",
                        selectedCategory === "all"
                            ? "bg-gradient-to-r from-primary-500 to-primary-600 text-white shadow-lg shadow-primary-500/30"
                            : "bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600"
                    )}
                >
                    {t("common.all")}
                </button>
                {#each categories as category (category.id)}
                    <button
                        onclick={() => (selectedCategory = category.id)}
                        class={cn(
                            "px-5 py-2.5 rounded-xl whitespace-nowrap transition-all font-medium flex items-center gap-2",
                            selectedCategory === category.id
                                ? "bg-gradient-to-r from-primary-500 to-primary-600 text-white shadow-lg shadow-primary-500/30"
                                : "bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600"
                        )}
                    >
                        <span>{category.icon}</span>
                        <span>{category.name}</span>
                    </button>
                {/each}
            </div>
        </div>
    </div>

    <!-- Menu Items -->
    <div class="max-w-4xl mx-auto p-4 pb-24">
        {#if isLoading}
            <div class="flex flex-col items-center justify-center py-20">
                <Loader2 class="w-12 h-12 text-primary-500 animate-spin" />
                <p class="text-gray-500 dark:text-gray-400 mt-4">{t("common.loading")}...</p>
            </div>
        {:else if error}
            <div class="text-center py-16">
                <div class="w-20 h-20 mx-auto bg-danger-100 dark:bg-danger-900/30 rounded-full flex items-center justify-center mb-4">
                    <AlertCircle class="w-10 h-10 text-danger-500" />
                </div>
                <p class="text-gray-700 dark:text-gray-300 mb-4">{error}</p>
                <button
                    onclick={loadMenu}
                    class="flex items-center gap-2 mx-auto px-5 py-2.5 bg-primary-600 text-white rounded-xl font-medium hover:bg-primary-700 transition-all"
                >
                    <RefreshCw class="w-4 h-4" />
                    {t("common.tryAgain")}
                </button>
            </div>
        {:else if filteredItems.length === 0}
            <div class="text-center py-16">
                <div class="w-20 h-20 mx-auto bg-gray-100 dark:bg-gray-800 rounded-full flex items-center justify-center mb-4">
                    <UtensilsCrossed class="w-10 h-10 text-gray-400" />
                </div>
                <p class="text-gray-500 dark:text-gray-400">{t("restaurant.noItems")}</p>
            </div>
        {:else}
            <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                {#each filteredItems as item (item.id)}
                    <button
                        onclick={() => openItemModal(item)}
                        disabled={!item.isAvailable}
                        class={cn(
                            "bg-white dark:bg-gray-800 rounded-2xl shadow-sm overflow-hidden text-left transition-all border border-gray-100 dark:border-gray-700",
                            item.isAvailable
                                ? "hover:shadow-xl hover:scale-[1.02] active:scale-[0.98]"
                                : "opacity-60 cursor-not-allowed grayscale"
                        )}
                    >
                        <div class="flex">
                            <!-- Image -->
                            <div class="w-32 h-32 bg-gradient-to-br from-gray-100 to-gray-200 dark:from-gray-700 dark:to-gray-800 flex items-center justify-center shrink-0 relative">
                                {#if item.image}
                                    <img
                                        src={item.image}
                                        alt={item.name}
                                        class="w-full h-full object-cover"
                                    />
                                {:else}
                                    <span class="text-4xl">{getCategoryIcon(item.category)}</span>
                                {/if}
                                
                                <!-- Badges -->
                                {#if item.isPopular}
                                    <div class="absolute top-2 left-2 px-2 py-1 bg-gradient-to-r from-danger-500 to-orange-500 text-white text-xs font-bold rounded-lg flex items-center gap-1 shadow-lg">
                                        <Star class="w-3 h-3" />
                                        {t("restaurant.popular")}
                                    </div>
                                {/if}
                            </div>

                            <div class="flex-1 p-4 flex flex-col justify-between">
                                <div>
                                    <div class="flex items-start justify-between gap-2">
                                        <h3 class="font-semibold text-gray-900 dark:text-white">
                                            {item.name}
                                        </h3>
                                        <div class="flex gap-1 shrink-0">
                                            {#if item.isSpicy}
                                                <span class="p-1 bg-danger-100 dark:bg-danger-900/50 rounded-lg" title={t("restaurant.spicy")}>
                                                    <Flame class="w-3.5 h-3.5 text-danger-500" />
                                                </span>
                                            {/if}
                                            {#if item.isVegetarian}
                                                <span class="p-1 bg-success-100 dark:bg-success-900/50 rounded-lg" title={t("restaurant.vegetarian")}>
                                                    <Leaf class="w-3.5 h-3.5 text-success-500" />
                                                </span>
                                            {/if}
                                        </div>
                                    </div>
                                    <p class="text-sm text-gray-500 dark:text-gray-400 mt-1 line-clamp-2">
                                        {item.description}
                                    </p>
                                </div>
                                <div class="flex items-center justify-between mt-3">
                                    <p class="font-bold text-lg text-primary-600 dark:text-primary-400">
                                        {formatCurrency(item.price)}
                                    </p>
                                    {#if !item.isAvailable}
                                        <span class="px-2 py-1 bg-danger-100 dark:bg-danger-900/50 text-danger-600 dark:text-danger-400 text-xs rounded-lg">
                                            {t("restaurant.soldOut")}
                                        </span>
                                    {:else}
                                        <div class="w-8 h-8 bg-primary-100 dark:bg-primary-900/50 rounded-full flex items-center justify-center">
                                            <Plus class="w-5 h-5 text-primary-600 dark:text-primary-400" />
                                        </div>
                                    {/if}
                                </div>
                            </div>
                        </div>
                    </button>
                {/each}
            </div>
        {/if}
    </div>

    <!-- Footer -->
    <div class="fixed bottom-0 inset-x-0 bg-white/80 dark:bg-gray-800/80 backdrop-blur-lg border-t border-gray-200 dark:border-gray-700 pb-safe">
        <div class="max-w-4xl mx-auto px-4 py-3 flex items-center justify-between">
            <div class="flex items-center gap-2 text-sm text-gray-500 dark:text-gray-400">
                <Clock class="w-4 h-4" />
                <span>{restaurantInfo.openTime} - {restaurantInfo.closeTime}</span>
            </div>
            
            {#if cart.length > 0}
                <button
                    onclick={() => (showCart = true)}
                    class="flex items-center gap-3 px-5 py-3 bg-gradient-to-r from-primary-500 to-primary-600 text-white rounded-2xl font-semibold shadow-lg shadow-primary-500/30 hover:from-primary-600 hover:to-primary-700 transition-all"
                >
                    <div class="relative">
                        <ShoppingBag class="w-5 h-5" />
                        <span class="absolute -top-2 -right-2 w-5 h-5 bg-danger-500 text-white text-xs rounded-full flex items-center justify-center font-bold">
                            {cartCount}
                        </span>
                    </div>
                    <span>{t("restaurant.viewOrder")}</span>
                    <span class="font-bold">{formatCurrency(cartTotal)}</span>
                </button>
            {:else}
                <div class="flex items-center gap-2 text-sm text-gray-400">
                    <ChefHat class="w-4 h-4" />
                    <span>Powered by KPOS</span>
                </div>
            {/if}
        </div>
    </div>
</div>

<!-- Item Detail Modal -->
{#if showItemModal && selectedItem}
    <div class="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-end md:items-center justify-center z-50">
        <div class="bg-white dark:bg-gray-800 rounded-t-3xl md:rounded-3xl w-full max-w-lg max-h-[90vh] overflow-y-auto animate-slide-up shadow-2xl">
            <!-- Image -->
            <div class="h-56 bg-gradient-to-br from-gray-100 to-gray-200 dark:from-gray-700 dark:to-gray-800 flex items-center justify-center relative">
                {#if selectedItem.image}
                    <img
                        src={selectedItem.image}
                        alt={selectedItem.name}
                        class="w-full h-full object-cover"
                    />
                {:else}
                    <span class="text-7xl">{getCategoryIcon(selectedItem.category)}</span>
                {/if}
                
                <button
                    onclick={() => (showItemModal = false)}
                    class="absolute top-4 right-4 p-2 bg-black/30 backdrop-blur rounded-full text-white hover:bg-black/50 transition-all"
                >
                    <X class="w-5 h-5" />
                </button>
                
                {#if selectedItem.isPopular}
                    <div class="absolute bottom-4 left-4 px-3 py-1.5 bg-gradient-to-r from-danger-500 to-orange-500 text-white text-sm font-bold rounded-xl flex items-center gap-1.5 shadow-lg">
                        <Star class="w-4 h-4" />
                        {t("restaurant.popular")}
                    </div>
                {/if}
            </div>

            <div class="p-6">
                <div class="flex items-start justify-between">
                    <div>
                        <h2 class="text-2xl font-bold text-gray-900 dark:text-white">{selectedItem.name}</h2>
                        <p class="text-sm text-gray-500 dark:text-gray-400 mt-1">
                            {categories.find((c) => c.id === selectedItem.category)?.name || ""}
                        </p>
                    </div>
                    <p class="text-2xl font-bold text-primary-600 dark:text-primary-400">
                        {formatCurrency(selectedItem.price)}
                    </p>
                </div>

                <p class="mt-4 text-gray-600 dark:text-gray-300">{selectedItem.description}</p>

                <div class="flex gap-3 mt-4">
                    {#if selectedItem.isSpicy}
                        <span class="px-3 py-1.5 bg-danger-100 dark:bg-danger-900/50 text-danger-600 dark:text-danger-400 text-sm rounded-xl flex items-center gap-1.5">
                            <Flame class="w-4 h-4" />
                            {t("restaurant.spicy")}
                        </span>
                    {/if}
                    {#if selectedItem.isVegetarian}
                        <span class="px-3 py-1.5 bg-success-100 dark:bg-success-900/50 text-success-600 dark:text-success-400 text-sm rounded-xl flex items-center gap-1.5">
                            <Leaf class="w-4 h-4" />
                            {t("restaurant.vegetarian")}
                        </span>
                    {/if}
                </div>

                <div class="mt-6">
                    <label for="a11y-app-restaurant-e-menu-page-svelte-1" class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                        {t("restaurant.specialInstructions")}
                    </label>
                    <textarea id="a11y-app-restaurant-e-menu-page-svelte-1"
                        bind:value={specialRequest}
                        rows="2"
                        class="w-full px-4 py-3 rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900 text-gray-900 dark:text-white placeholder-gray-400 focus:ring-2 focus:ring-primary-500 focus:border-transparent resize-none"
                        placeholder={t("restaurant.specialInstructionsExample")}
                    ></textarea>
                </div>

                <div class="mt-6 flex items-center justify-center gap-6">
                    <button
                        onclick={() => (quantity = Math.max(1, quantity - 1))}
                        class="w-12 h-12 rounded-xl bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 flex items-center justify-center transition-all"
                    >
                        <Minus class="w-5 h-5 text-gray-700 dark:text-gray-300" />
                    </button>
                    <span class="text-3xl font-bold text-gray-900 dark:text-white w-16 text-center">{quantity}</span>
                    <button
                        onclick={() => (quantity = quantity + 1)}
                        class="w-12 h-12 rounded-xl bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 flex items-center justify-center transition-all"
                    >
                        <Plus class="w-5 h-5 text-gray-700 dark:text-gray-300" />
                    </button>
                </div>

                <button
                    onclick={addToCart}
                    class="w-full mt-6 py-4 bg-gradient-to-r from-primary-500 to-primary-600 text-white rounded-2xl font-bold text-lg shadow-lg shadow-primary-500/30 hover:from-primary-600 hover:to-primary-700 active:scale-[0.98] transition-all flex items-center justify-center gap-3"
                >
                    <Plus class="w-5 h-5" />
                    {t("restaurant.addToOrder")} - {formatCurrency(selectedItem.price * quantity)}
                </button>
            </div>
        </div>
    </div>
{/if}

<!-- Cart Modal -->
{#if showCart}
    <div class="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-end md:items-center justify-center z-50">
        <div class="bg-white dark:bg-gray-800 rounded-t-3xl md:rounded-3xl w-full max-w-lg max-h-[90vh] overflow-hidden animate-slide-up shadow-2xl flex flex-col">
            <!-- Header -->
            <div class="px-6 py-4 bg-gradient-to-r from-primary-500 to-primary-600 flex items-center justify-between">
                <div class="flex items-center gap-3">
                    <ShoppingBag class="w-6 h-6 text-white" />
                    <h2 class="text-xl font-bold text-white">{t("restaurant.yourOrder")}</h2>
                </div>
                <button
                    onclick={() => (showCart = false)}
                    class="p-2 hover:bg-white/20 rounded-xl transition-all"
                >
                    <X class="w-5 h-5 text-white" />
                </button>
            </div>

            <!-- Items -->
            <div class="flex-1 overflow-y-auto p-4">
                {#if cart.length === 0}
                    <div class="text-center py-12">
                        <ShoppingBag class="w-16 h-16 mx-auto text-gray-300 dark:text-gray-600" />
                        <p class="text-gray-500 dark:text-gray-400 mt-4">{t("restaurant.emptyCart")}</p>
                    </div>
                {:else}
                    <div class="space-y-3">
                        {#each cart as item, index}
                            <div class="bg-gray-50 dark:bg-gray-700/50 rounded-2xl p-4 flex gap-4">
                                <div class="w-16 h-16 bg-gray-200 dark:bg-gray-700 rounded-xl flex items-center justify-center shrink-0">
                                    {#if item.image}
                                        <img src={item.image} alt={item.name} class="w-full h-full object-cover rounded-xl" />
                                    {:else}
                                        <span class="text-2xl">{getCategoryIcon(item.category)}</span>
                                    {/if}
                                </div>
                                <div class="flex-1 min-w-0">
                                    <h4 class="font-semibold text-gray-900 dark:text-white truncate">{item.name}</h4>
                                    {#if item.specialRequest}
                                        <p class="text-xs text-gray-500 dark:text-gray-400 truncate">{item.specialRequest}</p>
                                    {/if}
                                    <p class="font-bold text-primary-600 dark:text-primary-400 mt-1">
                                        {formatCurrency(item.price * item.quantity)}
                                    </p>
                                </div>
                                <div class="flex flex-col items-end justify-between">
                                    <button
                                        onclick={() => removeFromCart(index)}
                                        class="p-1.5 text-danger-500 hover:bg-danger-100 dark:hover:bg-danger-900/30 rounded-lg transition-all"
                                    >
                                        <Trash2 class="w-4 h-4" />
                                    </button>
                                    <div class="flex items-center gap-2">
                                        <button
                                            onclick={() => updateCartQuantity(index, -1)}
                                            class="w-8 h-8 rounded-lg bg-gray-200 dark:bg-gray-600 flex items-center justify-center text-gray-700 dark:text-gray-300"
                                        >
                                            <Minus class="w-4 h-4" />
                                        </button>
                                        <span class="w-6 text-center font-bold text-gray-900 dark:text-white">{item.quantity}</span>
                                        <button
                                            onclick={() => updateCartQuantity(index, 1)}
                                            class="w-8 h-8 rounded-lg bg-gray-200 dark:bg-gray-600 flex items-center justify-center text-gray-700 dark:text-gray-300"
                                        >
                                            <Plus class="w-4 h-4" />
                                        </button>
                                    </div>
                                </div>
                            </div>
                        {/each}
                    </div>
                {/if}
            </div>

            <!-- Footer -->
            {#if cart.length > 0}
                <div class="p-4 border-t border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50">
                    <div class="flex items-center justify-between mb-4">
                        <span class="text-gray-600 dark:text-gray-400">{t("common.total")}</span>
                        <span class="text-2xl font-bold text-gray-900 dark:text-white">{formatCurrency(cartTotal)}</span>
                    </div>
                    <button
                        onclick={submitOrder}
                        class="w-full py-4 bg-gradient-to-r from-success-500 to-emerald-600 text-white rounded-2xl font-bold text-lg shadow-lg shadow-success-500/30 hover:from-success-600 hover:to-emerald-700 active:scale-[0.98] transition-all flex items-center justify-center gap-3"
                    >
                        <Send class="w-5 h-5" />
                        {t("restaurant.placeOrder")}
                    </button>
                </div>
            {/if}
        </div>
    </div>
{/if}

<style>
    .scrollbar-hide::-webkit-scrollbar {
        display: none;
    }
    .scrollbar-hide {
        -ms-overflow-style: none;
        scrollbar-width: none;
    }
    @keyframes slide-up {
        from {
            transform: translateY(100%);
            opacity: 0;
        }
        to {
            transform: translateY(0);
            opacity: 1;
        }
    }
    .animate-slide-up {
        animation: slide-up 0.3s ease-out;
    }
    .pb-safe {
        padding-bottom: max(12px, env(safe-area-inset-bottom));
    }
</style>
