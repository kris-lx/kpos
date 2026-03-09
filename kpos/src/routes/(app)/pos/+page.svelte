<script lang="ts">
    import { cart, auth } from "$stores";
    import { cn, formatCurrency } from "$utils";
    import { t } from "$lib/i18n/index.svelte";
    import { createQuery, useQueryClient } from "@tanstack/svelte-query";
    import { api, type Product } from "$api";
    import { toast } from "svelte-sonner";
    import { onMount, onDestroy } from "svelte";
    import { goto } from "$app/navigation";
    import ReceiptPrint from "$lib/components/ReceiptPrint.svelte";
    import {
        Search,
        Plus,
        Minus,
        Trash2,
        X,
        User,
        CreditCard,
        Banknote,
        QrCode,
        Percent,
        Tag,
        Receipt,
        Printer,
        Package,
        Pause,
        Play,
        UserCheck,
        Calendar,
    } from "lucide-svelte";

    const queryClient = useQueryClient();

    // State
    let searchQuery = $state("");
    let selectedCategory = $state<string | null>(null);
    let showPaymentModal = $state(false);
    let showCustomerModal = $state(false);
    let showDiscountModal = $state(false);
    let showHeldBillsModal = $state(false);
    let paymentMethod = $state<"cash" | "card" | "qr" | "credit">("cash");
    let cashReceived = $state(0);
    let isProcessing = $state(false);
    let customerSearchQuery = $state("");
    let heldBills = $state<Array<{id: string, items: typeof cart.items, customer: typeof cart.customer, discountType: typeof cart.discountType, discountValue: typeof cart.discountValue, timestamp: Date}>>([]);
    
    // Credit sale state
    let creditInitialPayment = $state(0);
    let creditDueDate = $state("");
    
    // Receipt print state
    let showReceiptModal = $state(false);
    let receiptData = $state<any>(null);

    // BroadcastChannel for customer display sync
    let displayChannel: BroadcastChannel | null = null;

    onMount(() => {
        // Initialize BroadcastChannel for customer display
        if (typeof BroadcastChannel !== "undefined") {
            displayChannel = new BroadcastChannel("kpos_customer_display");
        }
        
        // Check if there's a resumed order from held page
        const resumedOrder = sessionStorage.getItem('kpos_resume_order');
        if (resumedOrder) {
            try {
                const order = JSON.parse(resumedOrder);
                sessionStorage.removeItem('kpos_resume_order');
                // Restore cart from resumed order
                cart.clear();
                if (order.items && Array.isArray(order.items)) {
                    order.items.forEach((item: any) => {
                        const product = {
                            id: item.productId,
                            name: item.productName,
                            price: item.unitPrice,
                            sku: '',
                            categoryId: '',
                            salePrice: item.unitPrice,
                            costPrice: 0,
                            unit: '',
                            stock: undefined, // Don't limit stock for resumed orders
                            isActive: true
                        } as Product;
                        // Add with full quantity at once
                        cart.addItem(product, item.quantity);
                    });
                }
                toast.success('ໂຫຼດອໍເດີຄ້າງສຳເລັດ');
            } catch (e) {
                console.error('Failed to restore resumed order:', e);
                toast.error('ບໍ່ສາມາດໂຫຼດອໍເດີຄ້າງໄດ້');
            }
        }
    });

    onDestroy(() => {
        if (displayChannel) {
            displayChannel.close();
        }
    });

    // Sync cart to customer display
    $effect(() => {
        if (displayChannel) {
            const transactionData = {
                items: cart.items.map(item => {
                    const unitPrice = item.product.price || item.product.salePrice || 0;
                    return {
                        id: item.product.id,
                        name: item.product.name,
                        image: item.product.image || item.product.images?.[0] || null,
                        quantity: item.quantity,
                        price: unitPrice,
                        total: unitPrice * item.quantity
                    };
                }),
                subtotal: cart.subtotal,
                discount: cart.discountAmount,
                tax: cart.taxAmount,
                total: cart.total,
                customerName: cart.customer?.name,
                status: cart.itemCount > 0 ? "active" : "idle" as "idle" | "active" | "payment" | "complete"
            };
            displayChannel.postMessage({
                type: "transaction_update",
                payload: transactionData
            });
        }
    });

    // Active store context — queries re-run when store switches
    const activeStoreId = $derived(auth.activeStoreId);

    // Queries - Using any type to avoid TypeScript complexity with TanStack Query
    const productsQuery = createQuery<Product[], Error>({
        queryKey: ["products", activeStoreId],
        queryFn: async () => {
            const params = new URLSearchParams();
            params.append("limit", "100");
            const response = await api.get(`products?${params}`).json<{ data: any[] }>();
            // Transform data to include convenience fields
            return (response.data || []).map((p: any) => ({
                ...p,
                price: p.salePrice || p.price || 0,
                stock: p.inventory?.quantity ?? p.stock ?? 0,
                image: p.images?.[0] || p.image,
            })) as Product[];
        },
    });
    
    // Filtered products based on search and category
    const filteredProducts = $derived(
        ($productsQuery.data || []).filter((p: Product) => {
            const matchesSearch = !searchQuery || 
                p.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
                p.sku.toLowerCase().includes(searchQuery.toLowerCase());
            const matchesCategory = !selectedCategory || p.categoryId === selectedCategory;
            return matchesSearch && matchesCategory;
        })
    );

    const categoriesQuery = createQuery({
        queryKey: ["categories"],
        queryFn: async () => {
            const response = await api.get("categories").json<any>();
            return response.data || [];
        },
    });

    // Customers query — scoped to active store
    const customersQuery = createQuery({
        queryKey: ["customers"],
        queryFn: async () => {
            const response = await api.get("customers?limit=100").json<any>();
            return response.data || [];
        },
    });

    // Refetch store-scoped queries when active store changes
    $effect(() => {
        void activeStoreId;
        $productsQuery.refetch();
        $categoriesQuery.refetch();
        $customersQuery.refetch();
    });

    // Filtered customers based on search
    const filteredCustomers = $derived(
        ($customersQuery.data || []).filter((c: any) => {
            if (!customerSearchQuery) return true;
            const search = customerSearchQuery.toLowerCase();
            return (
                c.name?.toLowerCase().includes(search) ||
                c.phone?.toLowerCase().includes(search) ||
                c.email?.toLowerCase().includes(search)
            );
        })
    );

    // Derived
    let change = $derived(cashReceived - cart.total);
    let canCheckout = $derived(
        cart.itemCount > 0 &&
            (!showPaymentModal ||
                (paymentMethod === "cash" ? cashReceived >= cart.total : 
                 paymentMethod === "credit" ? cart.customer !== null : true)),
    );

    // Hold Bill function
    async function holdBill() {
        if (cart.itemCount === 0) {
            toast.error(t('pos.noItemsToHold'));
            return;
        }
        
        try {
            const heldSaleData = {
                name: cart.customer?.name || `ບິນ ${new Date().toLocaleTimeString()}`,
                items: cart.items.map(item => ({
                    productId: item.product.id,
                    productName: item.product.name,
                    quantity: item.quantity,
                    unitPrice: item.product.price || item.product.salePrice || 0,
                    total: (item.product.price || item.product.salePrice || 0) * item.quantity
                })),
                subtotal: cart.subtotal,
                discount: cart.discountAmount,
                total: cart.total,
                memberId: cart.customer?.id,
                note: ''
            };
            
            const response = await api.post('sales/held', { json: heldSaleData }).json<any>();
            if (response.success) {
                cart.clear();
                toast.success(t('pos.billHeld'));
                goto('/pos/held');
            } else {
                toast.error(response.error?.message || 'ບໍ່ສາມາດພັກບິນໄດ້');
            }
        } catch (err) {
            console.error('Failed to hold bill:', err);
            toast.error('ບໍ່ສາມາດພັກບິນໄດ້');
        }
    }

    // Recall Bill function
    function recallBill(bill: typeof heldBills[0]) {
        // Restore cart from held bill
        cart.clear();
        bill.items.forEach(item => {
            for (let i = 0; i < item.quantity; i++) {
                const result = cart.addItem(item.product);
                if (!result.success) {
                    toast.error(result.message);
                    return;
                }
            }
        });
        if (bill.customer) {
            cart.setCustomer(bill.customer);
        }
        if (bill.discountType && bill.discountValue) {
            cart.setDiscount(bill.discountType, bill.discountValue);
        }
        
        // Remove from held bills
        heldBills = heldBills.filter(b => b.id !== bill.id);
        localStorage.setItem("kpos_held_bills", JSON.stringify(heldBills));
        showHeldBillsModal = false;
        toast.success(t('pos.billRecalled'));
    }

    // Delete held bill
    function deleteHeldBill(billId: string) {
        heldBills = heldBills.filter(b => b.id !== billId);
        localStorage.setItem("kpos_held_bills", JSON.stringify(heldBills));
        toast.success(t('pos.billDeleted'));
    }

    // Add-to-cart fly animation
    let flyingItems = $state<Array<{id: string; x: number; y: number; name: string}>>([]);

    function addToCart(product: any, event?: MouseEvent) {
        const result = cart.addItem(product);
        if (!result.success) {
            toast.error(result.message);
            return;
        }

        // Trigger fly animation from product card to cart
        if (event) {
            const rect = (event.currentTarget as HTMLElement).getBoundingClientRect();
            const flyId = `fly-${Date.now()}`;
            flyingItems = [...flyingItems, { id: flyId, x: rect.left + rect.width / 2, y: rect.top + rect.height / 2, name: product.name }];
            setTimeout(() => { flyingItems = flyingItems.filter(f => f.id !== flyId); }, 600);
        }
    }

    async function processPayment() {
        isProcessing = true;

        // Broadcast payment status
        if (displayChannel) {
            displayChannel.postMessage({
                type: "transaction_update",
                payload: {
                    items: cart.items.map(item => {
                        const unitPrice = item.product.price || item.product.salePrice || 0;
                        return {
                            id: item.product.id,
                            name: item.product.name,
                            image: item.product.image || item.product.images?.[0] || null,
                            quantity: item.quantity,
                            price: unitPrice,
                            total: unitPrice * item.quantity
                        };
                    }),
                    subtotal: cart.subtotal,
                    discount: cart.discountAmount,
                    tax: cart.taxAmount,
                    total: cart.total,
                    customerName: cart.customer?.name,
                    paymentMethod,
                    status: "payment"
                }
            });
        }

        try {
            // Prepare receipt data before clearing cart
            const receiptItems = cart.items.map((item) => ({
                productId: item.product.id,
                productName: item.product.name,
                quantity: item.quantity,
                unitPrice: item.product.price || item.product.salePrice || 0,
                total: (item.product.price || item.product.salePrice || 0) * item.quantity,
            }));
            const receiptSubtotal = cart.subtotal;
            const receiptDiscount = cart.discountAmount;
            const receiptTotal = cart.total;
            const receiptCustomerName = cart.customer?.name;
            const receiptCashReceived = paymentMethod === "cash" ? cashReceived : (paymentMethod === "credit" ? creditInitialPayment : 0);
            const receiptChange = paymentMethod === "cash" ? change : 0;

            let response: any;
            
            if (paymentMethod === "credit") {
                // Credit sale - use different endpoint
                const creditSaleData = {
                    items: cart.items.map((item) => ({
                        productId: item.product.id,
                        quantity: item.quantity,
                        price: item.product.price || item.product.salePrice || 0,
                    })),
                    customerId: cart.customer!.id,
                    initialPayment: creditInitialPayment > 0 ? creditInitialPayment : undefined,
                    dueDate: creditDueDate || undefined,
                    discountType: cart.discountType,
                    discountValue: cart.discountValue,
                    notes: "",
                };
                response = await api.post("sales/credit", { json: creditSaleData }).json<any>();
            } else {
                // Normal sale
                const saleData = {
                    items: cart.items.map((item) => ({
                        productId: item.product.id,
                        quantity: item.quantity,
                        price: item.product.price || item.product.salePrice || 0,
                    })),
                    customerId: cart.customer?.id,
                    paymentMethod: paymentMethod.toUpperCase(),
                    discountType: cart.discountType,
                    discountValue: cart.discountValue,
                    notes: "",
                    cashReceived:
                        paymentMethod === "cash" ? cashReceived : undefined,
                    change: paymentMethod === "cash" ? change : undefined,
                };
                response = await api.post("sales", { json: saleData }).json<any>();
            }

            // Invalidate queries to refresh stock (store-scoped)
            queryClient.invalidateQueries({ queryKey: ["products", activeStoreId] });
            queryClient.invalidateQueries({ queryKey: ["inventory", activeStoreId] });
            queryClient.invalidateQueries({ queryKey: ["inventory-stats", activeStoreId] });
            queryClient.invalidateQueries({ queryKey: ["dashboard", activeStoreId] });

            // Broadcast complete status
            if (displayChannel) {
                displayChannel.postMessage({
                    type: "transaction_update",
                    payload: {
                        items: [],
                        subtotal: 0,
                        discount: 0,
                        tax: 0,
                        total: 0,
                        change: paymentMethod === "cash" ? change : undefined,
                        status: "complete"
                    }
                });
            }

            // Set receipt data and show print modal
            receiptData = {
                transactionNo: response?.data?.transactionNo || `TXN-${Date.now()}`,
                items: receiptItems,
                subtotal: receiptSubtotal,
                discountAmount: receiptDiscount,
                total: receiptTotal,
                received: receiptCashReceived,
                change: receiptChange,
                paymentMethod: paymentMethod === "credit" ? "ຂາຍເຊື່ອ" : paymentMethod.toUpperCase(),
                customerName: receiptCustomerName,
                createdAt: new Date(),
            };
            
            if (paymentMethod === "credit") {
                toast.success("ບັນທຶກການຂາຍເຊື່ອສຳເລັດ");
            } else {
                toast.success(t('pos.paymentSuccess'));
            }
            cart.clear();
            showPaymentModal = false;
            cashReceived = 0;
            creditInitialPayment = 0;
            creditDueDate = "";
            
            // Show receipt modal for printing
            showReceiptModal = true;
        } catch (error) {
            toast.error(t('pos.paymentError'));
            console.error(error);
        } finally {
            isProcessing = false;
        }
    }

    function quickCashAmounts(total: number): number[] {
        const amounts = [20, 50, 100, 500, 1000];
        const roundedUp = Math.ceil(total / 100) * 100;
        if (!amounts.includes(roundedUp) && roundedUp > total) {
            amounts.push(roundedUp);
        }
        return amounts
            .filter((a) => a >= total)
            .sort((a, b) => a - b)
            .slice(0, 5);
    }
</script>

<svelte:head>
    <title>{t('pos.title')} - KPOS</title>
</svelte:head>

<div class="h-[calc(100vh-4rem)] flex">
    <!-- Products Section -->
    <div class="flex-1 flex flex-col bg-gray-50 dark:bg-gray-950">
        <!-- Search & Categories -->
        <div
            class="p-4 bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-800"
        >
            <!-- Search -->
            <div class="relative mb-4">
                <Search
                    class="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400"
                />
                <input
                    type="text"
                    placeholder={t('pos.searchProduct')}
                    bind:value={searchQuery}
                    class="w-full pl-10 pr-4 py-3 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
                />
            </div>

            <!-- Categories -->
            <div class="flex gap-2 overflow-x-auto pb-2 scrollbar-hide">
                <button
                    onclick={() => (selectedCategory = null)}
                    class={cn(
                        "px-4 py-2 rounded-full text-sm font-medium whitespace-nowrap transition-colors",
                        !selectedCategory
                            ? "bg-primary-500 text-white"
                            : "bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700",
                    )}
                >
                    {t('common.all')}
                </button>
                {#if $categoriesQuery.data}
                    {#each $categoriesQuery.data as category (category.id)}
                        <button
                            onclick={() => (selectedCategory = category.id)}
                            class={cn(
                                "px-4 py-2 rounded-full text-sm font-medium whitespace-nowrap transition-colors",
                                selectedCategory === category.id
                                    ? "bg-primary-500 text-white"
                                    : "bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700",
                            )}
                        >
                            {category.name}
                        </button>
                    {/each}
                {/if}
            </div>
        </div>

        <!-- Product Grid -->
        <div class="flex-1 overflow-auto p-4">
            {#if $productsQuery.isLoading}
                <div
                    class="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4"
                >
                    {#each Array(12) as _, i (i)}
                        <div
                            class="bg-white dark:bg-gray-800 rounded-xl p-4 animate-pulse"
                        >
                            <div
                                class="aspect-square bg-gray-200 dark:bg-gray-700 rounded-lg mb-3"
                            ></div>
                            <div
                                class="h-4 bg-gray-200 dark:bg-gray-700 rounded mb-2"
                            ></div>
                            <div
                                class="h-4 bg-gray-200 dark:bg-gray-700 rounded w-2/3"
                            ></div>
                        </div>
                    {/each}
                </div>
            {:else if filteredProducts.length === 0}
                <div
                    class="flex flex-col items-center justify-center h-full text-gray-500"
                >
                    <Package class="w-16 h-16 mb-4 text-gray-300" />
                    <p class="text-lg">{t('pos.noProducts')}</p>
                    <p class="text-sm">{t('pos.tryAnotherSearch')}</p>
                </div>
            {:else}
                <div
                    class="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4"
                >
                    {#each filteredProducts as product (product.id)}
                        {@const cartItem = cart.items.find(item => item.product.id === product.id)}
                        {@const isInCart = !!cartItem}
                        <button
                            onclick={(e) => addToCart(product, e)}
                            class={cn(
                                "relative bg-white dark:bg-gray-800 rounded-xl p-4 text-left transition-all",
                                "hover:shadow-lg hover:scale-[1.02] active:scale-[0.98]",
                                "border-2",
                                isInCart
                                    ? "border-primary-500 ring-2 ring-primary-200 dark:ring-primary-800"
                                    : "border-gray-200 dark:border-gray-700",
                                product.stock <= 0 &&
                                    "opacity-50 cursor-not-allowed",
                            )}
                            disabled={product.stock <= 0}
                        >
                            <!-- Quantity Badge -->
                            {#if isInCart && cartItem}
                                <div class="absolute -top-2 -right-2 w-7 h-7 bg-primary-500 text-white rounded-full flex items-center justify-center text-sm font-bold shadow-lg z-10">
                                    {cartItem.quantity}
                                </div>
                            {/if}
                            
                            <!-- Image -->
                            <div
                                class={cn(
                                    "aspect-square rounded-lg mb-3 flex items-center justify-center overflow-hidden",
                                    isInCart ? "bg-primary-50 dark:bg-primary-900/30" : "bg-gray-100 dark:bg-gray-700"
                                )}
                            >
                                {#if product.image}
                                    <img
                                        src={product.image}
                                        alt={product.name}
                                        class="w-full h-full object-cover"
                                    />
                                {:else}
                                    <Package class="w-8 h-8 text-gray-400" />
                                {/if}
                            </div>

                            <!-- Info -->
                            <h3
                                class="font-medium text-gray-900 dark:text-white text-sm line-clamp-2 mb-1"
                            >
                                {product.name}
                            </h3>
                            <p class="text-xs text-gray-500 mb-2">
                                {product.sku}
                            </p>
                            <div class="flex items-center justify-between">
                                <span class="font-bold text-primary-600"
                                    >{formatCurrency(product.price)}</span
                                >
                                <span
                                    class={cn(
                                        "text-xs px-2 py-0.5 rounded-full",
                                        product.stock > 10
                                            ? "bg-success-100 text-success-700"
                                            : product.stock > 0
                                              ? "bg-warning-100 text-warning-700"
                                              : "bg-error-100 text-error-700",
                                    )}
                                >
                                    {product.stock > 0
                                        ? `${product.stock} ${t('pos.unit')}`
                                        : t('pos.outOfStock')}
                                </span>
                            </div>
                        </button>
                    {/each}
                </div>
            {/if}
        </div>
    </div>

    <!-- Cart Section -->
    <div
        class="w-96 bg-white dark:bg-gray-900 border-l border-gray-200 dark:border-gray-800 flex flex-col"
    >
        <!-- Cart Header -->
        <div class="p-4 border-b border-gray-200 dark:border-gray-800">
            <div class="flex items-center justify-between mb-3">
                <h2 class="text-lg font-semibold text-gray-900 dark:text-white">
                    {t('pos.cart')}
                </h2>
                <div class="flex gap-2">
                    {#if heldBills.length > 0}
                        <button
                            onclick={() => (showHeldBillsModal = true)}
                            class="text-primary-500 hover:text-primary-600 text-sm flex items-center gap-1"
                        >
                            <Play class="w-4 h-4" />
                            {t('pos.recall')} ({heldBills.length})
                        </button>
                    {/if}
                    {#if cart.itemCount > 0}
                        <button
                            onclick={holdBill}
                            class="text-warning-500 hover:text-warning-600 text-sm flex items-center gap-1"
                        >
                            <Pause class="w-4 h-4" />
                            {t('pos.hold')}
                        </button>
                        <button
                            onclick={() => cart.clear()}
                            class="text-error-500 hover:text-error-600 text-sm"
                        >
                            {t('pos.clearCart')}
                        </button>
                    {/if}
                </div>
            </div>

            <!-- Customer -->
            <button
                onclick={() => (showCustomerModal = true)}
                class={cn(
                    "w-full flex items-center gap-3 p-3 rounded-xl border border-dashed transition-colors",
                    cart.customer
                        ? "border-primary-300 bg-primary-50 dark:bg-primary-900/20"
                        : "border-gray-300 dark:border-gray-700 hover:border-primary-300",
                )}
            >
                <div
                    class={cn(
                        "w-10 h-10 rounded-full flex items-center justify-center",
                        cart.customer
                            ? "bg-primary-500 text-white"
                            : "bg-gray-100 dark:bg-gray-800 text-gray-400",
                    )}
                >
                    <User class="w-5 h-5" />
                </div>
                {#if cart.customer}
                    <div class="text-left">
                        <p class="font-medium text-gray-900 dark:text-white">
                            {cart.customer.name}
                        </p>
                        <p class="text-xs text-gray-500">
                            {cart.customer.phone || t('pos.memberCustomer')}
                        </p>
                    </div>
                {:else}
                    <span class="text-gray-500">{t('pos.selectCustomer')}</span>
                {/if}
            </button>
        </div>

        <!-- Cart Items -->
        <div class="flex-1 overflow-auto p-4">
            {#if cart.itemCount === 0}
                <div
                    class="flex flex-col items-center justify-center h-full text-gray-400"
                >
                    <Receipt class="w-16 h-16 mb-4" />
                    <p>{t('pos.emptyCart')}</p>
                </div>
            {:else}
                <div class="space-y-3">
                    {#each cart.items as item (item.product.id)}
                        <div class="bg-gray-50 dark:bg-gray-800 rounded-xl p-3">
                            <div class="flex items-start gap-3">
                                <!-- Product Image -->
                                <div class="w-14 h-14 rounded-lg overflow-hidden bg-gray-200 dark:bg-gray-700 shrink-0">
                                    {#if item.product.images?.[0] || item.product.image}
                                        <img
                                            src={item.product.images?.[0] || item.product.image}
                                            alt={item.product.name}
                                            class="w-full h-full object-cover"
                                        />
                                    {:else}
                                        <div class="w-full h-full flex items-center justify-center">
                                            <Package class="w-6 h-6 text-gray-400" />
                                        </div>
                                    {/if}
                                </div>
                                <div class="flex-1 min-w-0">
                                    <h4
                                        class="font-medium text-gray-900 dark:text-white text-sm truncate"
                                    >
                                        {item.product.name}
                                    </h4>
                                    <p class="text-xs text-gray-500">
                                        {item.product.sku}
                                    </p>
                                    <div class="flex items-center gap-2 mt-1">
                                        <span class="text-sm text-primary-600 font-medium">
                                            {formatCurrency(item.product.price || item.product.salePrice || 0)}
                                        </span>
                                        <span class="text-xs text-gray-400">x{item.quantity}</span>
                                    </div>
                                </div>
                                <button
                                    onclick={() =>
                                        cart.removeItem(item.product.id)}
                                    class="text-gray-400 hover:text-error-500"
                                >
                                    <Trash2 class="w-4 h-4" />
                                </button>
                            </div>

                            <!-- Quantity & Total -->
                            <div class="flex items-center justify-between mt-3">
                                <div class="flex items-center gap-2">
                                    <button
                                        onclick={() =>
                                            cart.updateQuantity(
                                                item.product.id,
                                                item.quantity - 1,
                                            )}
                                        class="w-8 h-8 rounded-lg bg-white dark:bg-gray-700 border border-gray-200 dark:border-gray-600 flex items-center justify-center hover:bg-gray-100"
                                    >
                                        <Minus class="w-4 h-4" />
                                    </button>
                                    <span class="w-10 text-center font-medium"
                                        >{item.quantity}</span
                                    >
                                    <button
                                        onclick={() => {
                                            const result = cart.updateQuantity(
                                                item.product.id,
                                                item.quantity + 1,
                                            );
                                            if (!result.success) {
                                                toast.error(result.message);
                                            }
                                        }}
                                        class="w-8 h-8 rounded-lg bg-white dark:bg-gray-700 border border-gray-200 dark:border-gray-600 flex items-center justify-center hover:bg-gray-100"
                                    >
                                        <Plus class="w-4 h-4" />
                                    </button>
                                </div>
                                <span
                                    class="font-bold text-gray-900 dark:text-white"
                                >
                                    {formatCurrency(
                                        (item.product.price || item.product.salePrice || 0) * item.quantity,
                                    )}
                                </span>
                            </div>
                        </div>
                    {/each}
                </div>
            {/if}
        </div>

        <!-- Cart Summary -->
        <div
            class="border-t border-gray-200 dark:border-gray-800 p-4 space-y-3"
        >
            <!-- Discount Button -->
            <button
                onclick={() => (showDiscountModal = true)}
                class="w-full flex items-center justify-between p-3 rounded-xl border border-gray-200 dark:border-gray-700 hover:border-primary-300 transition-colors"
            >
                <div
                    class="flex items-center gap-2 text-gray-600 dark:text-gray-400"
                >
                    <Tag class="w-4 h-4" />
                    <span>{t('pos.discountPromotion')}</span>
                </div>
                {#if cart.discountAmount > 0}
                    <span class="text-error-500"
                        >-{formatCurrency(cart.discountAmount)}</span
                    >
                {:else}
                    <span class="text-gray-400">{t('common.add')}</span>
                {/if}
            </button>

            <!-- Summary Lines -->
            <div class="space-y-2 text-sm">
                <div
                    class="flex justify-between text-gray-600 dark:text-gray-400"
                >
                    <span>{t('pos.subtotal')} ({cart.itemCount} {t('pos.items')})</span>
                    <span>{formatCurrency(cart.subtotal)}</span>
                </div>
                {#if cart.discountAmount > 0}
                    <div class="flex justify-between text-error-500">
                        <span>{t('pos.discount')}</span>
                        <span>-{formatCurrency(cart.discountAmount)}</span>
                    </div>
                {/if}
                <div
                    class="flex justify-between text-gray-600 dark:text-gray-400"
                >
                    <span>{t('pos.tax')} (7%)</span>
                    <span>{formatCurrency(cart.taxAmount)}</span>
                </div>
                <hr class="border-gray-200 dark:border-gray-700" />
                <div
                    class="flex justify-between text-xl font-bold text-gray-900 dark:text-white"
                >
                    <span>{t('pos.total')}</span>
                    <span class="text-primary-600"
                        >{formatCurrency(cart.total)}</span
                    >
                </div>
            </div>

            <!-- Checkout Button -->
            <button
                onclick={() => (showPaymentModal = true)}
                disabled={cart.itemCount === 0}
                class={cn(
                    "w-full py-4 rounded-xl font-semibold text-lg transition-colors",
                    "bg-primary-500 hover:bg-primary-600 text-white",
                    "disabled:opacity-50 disabled:cursor-not-allowed",
                )}
            >
                {t('pos.checkout')}
            </button>
        </div>
    </div>
</div>

<!-- Payment Modal -->
{#if showPaymentModal}
    <div
        class="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50"
    >
        <div
            class="bg-white dark:bg-gray-900 rounded-2xl w-full max-w-lg shadow-xl"
        >
            <!-- Header -->
            <div
                class="flex items-center justify-between p-4 border-b border-gray-200 dark:border-gray-800"
            >
                <h3 class="text-lg font-semibold text-gray-900 dark:text-white">
                    {t('pos.checkout')}
                </h3>
                <button
                    onclick={() => (showPaymentModal = false)}
                    class="text-gray-400 hover:text-gray-600"
                >
                    <X class="w-6 h-6" />
                </button>
            </div>

            <!-- Content -->
            <div class="p-4 space-y-4">
                <!-- Total -->
                <div
                    class="text-center py-4 bg-gray-50 dark:bg-gray-800 rounded-xl"
                >
                    <p class="text-sm text-gray-500 mb-1">{t('pos.amountDue')}</p>
                    <p class="text-3xl font-bold text-primary-600">
                        {formatCurrency(cart.total)}
                    </p>
                </div>

                <!-- Payment Methods -->
                <div class="grid grid-cols-4 gap-3">
                    <button
                        onclick={() => (paymentMethod = "cash")}
                        class={cn(
                            "flex flex-col items-center gap-2 p-4 rounded-xl border-2 transition-colors",
                            paymentMethod === "cash"
                                ? "border-primary-500 bg-primary-50 dark:bg-primary-900/20"
                                : "border-gray-200 dark:border-gray-700 hover:border-primary-300",
                        )}
                    >
                        <Banknote class="w-6 h-6" />
                        <span class="text-sm font-medium">{t('pos.cash')}</span>
                    </button>
                    <button
                        onclick={() => (paymentMethod = "card")}
                        class={cn(
                            "flex flex-col items-center gap-2 p-4 rounded-xl border-2 transition-colors",
                            paymentMethod === "card"
                                ? "border-primary-500 bg-primary-50 dark:bg-primary-900/20"
                                : "border-gray-200 dark:border-gray-700 hover:border-primary-300",
                        )}
                    >
                        <CreditCard class="w-6 h-6" />
                        <span class="text-sm font-medium">{t('pos.card')}</span>
                    </button>
                    <button
                        onclick={() => (paymentMethod = "qr")}
                        class={cn(
                            "flex flex-col items-center gap-2 p-4 rounded-xl border-2 transition-colors",
                            paymentMethod === "qr"
                                ? "border-primary-500 bg-primary-50 dark:bg-primary-900/20"
                                : "border-gray-200 dark:border-gray-700 hover:border-primary-300",
                        )}
                    >
                        <QrCode class="w-6 h-6" />
                        <span class="text-sm font-medium">{t('pos.qrCode')}</span>
                    </button>
                    <button
                        onclick={() => (paymentMethod = "credit")}
                        class={cn(
                            "flex flex-col items-center gap-2 p-4 rounded-xl border-2 transition-colors",
                            paymentMethod === "credit"
                                ? "border-orange-500 bg-orange-50 dark:bg-orange-900/20"
                                : "border-gray-200 dark:border-gray-700 hover:border-orange-300",
                        )}
                    >
                        <UserCheck class="w-6 h-6" />
                        <span class="text-sm font-medium">ຂາຍເຊື່ອ</span>
                    </button>
                </div>

                <!-- Cash Payment -->
                {#if paymentMethod === "cash"}
                    <div class="space-y-3">
                        <label class="block">
                            <span
                                class="text-sm font-medium text-gray-700 dark:text-gray-300"
                                >{t('pos.cashReceived')}</span
                            >
                            <input
                                type="number"
                                bind:value={cashReceived}
                                class="mt-1 w-full px-4 py-3 rounded-xl border border-gray-200 dark:border-gray-700 text-right text-xl font-bold focus:ring-2 focus:ring-primary-500"
                                placeholder="0.00"
                            />
                        </label>

                        <!-- Quick Cash Buttons -->
                        <div class="flex flex-wrap gap-2">
                            {#each quickCashAmounts(cart.total) as amount (amount)}
                                <button
                                    onclick={() => (cashReceived = amount)}
                                    class={cn(
                                        "px-4 py-2 rounded-lg text-sm font-medium transition-colors",
                                        cashReceived === amount
                                            ? "bg-primary-500 text-white"
                                            : "bg-gray-100 dark:bg-gray-800 hover:bg-gray-200",
                                    )}
                                >
                                    {formatCurrency(amount)}
                                </button>
                            {/each}
                            <button
                                onclick={() => (cashReceived = cart.total)}
                                class="px-4 py-2 rounded-lg text-sm font-medium bg-success-100 text-success-700 hover:bg-success-200"
                            >
                                {t('pos.exact')}
                            </button>
                        </div>

                        <!-- Change -->
                        {#if cashReceived >= cart.total}
                            <div
                                class="p-4 bg-success-50 dark:bg-success-900/20 rounded-xl text-center"
                            >
                                <p class="text-sm text-success-600 mb-1">
                                    {t('pos.change')}
                                </p>
                                <p class="text-2xl font-bold text-success-700">
                                    {formatCurrency(change)}
                                </p>
                            </div>
                        {/if}
                    </div>
                {:else if paymentMethod === "qr"}
                    <div class="text-center py-8">
                        <div
                            class="w-48 h-48 mx-auto bg-gray-100 rounded-xl flex items-center justify-center mb-4"
                        >
                            <QrCode class="w-32 h-32 text-gray-400" />
                        </div>
                        <p class="text-sm text-gray-500">
                            {t('pos.scanQrToPay')}
                        </p>
                    </div>
                {:else if paymentMethod === "credit"}
                    <div class="space-y-4">
                        <!-- Customer Required Warning -->
                        {#if !cart.customer}
                            <div class="p-4 bg-orange-50 dark:bg-orange-900/20 rounded-xl border border-orange-200 dark:border-orange-800">
                                <div class="flex items-start gap-3">
                                    <UserCheck class="w-5 h-5 text-orange-600 dark:text-orange-400 shrink-0 mt-0.5" />
                                    <div>
                                        <p class="font-medium text-orange-800 dark:text-orange-200">ຕ້ອງເລືອກລູກຄ້າ</p>
                                        <p class="text-sm text-orange-600 dark:text-orange-400 mt-1">ກະລຸນາເລືອກລູກຄ້າກ່ອນຂາຍເຊື່ອ</p>
                                        <button
                                            onclick={() => { showPaymentModal = false; showCustomerModal = true; }}
                                            class="mt-2 px-3 py-1.5 bg-orange-600 text-white text-sm rounded-lg hover:bg-orange-700"
                                        >
                                            ເລືອກລູກຄ້າ
                                        </button>
                                    </div>
                                </div>
                            </div>
                        {:else}
                            <div class="p-4 bg-green-50 dark:bg-green-900/20 rounded-xl border border-green-200 dark:border-green-800">
                                <div class="flex items-center gap-3">
                                    <User class="w-5 h-5 text-green-600 dark:text-green-400" />
                                    <div>
                                        <p class="font-medium text-green-800 dark:text-green-200">{cart.customer.name}</p>
                                        <p class="text-sm text-green-600 dark:text-green-400">{cart.customer.phone || 'ບໍ່ມີເບີໂທ'}</p>
                                    </div>
                                </div>
                            </div>
                        {/if}
                        
                        <!-- Initial Payment (Optional) -->
                        <div>
                            <label class="block">
                                <span class="text-sm font-medium text-gray-700 dark:text-gray-300">ເງີນມັດຈຳ (ບໍ່ບັງຄັບ)</span>
                                <input
                                    type="number"
                                    bind:value={creditInitialPayment}
                                    min="0"
                                    max={cart.total}
                                    class="mt-1 w-full px-4 py-3 rounded-xl border border-gray-200 dark:border-gray-700 dark:bg-gray-800 text-right text-lg font-bold focus:ring-2 focus:ring-primary-500"
                                    placeholder="0"
                                />
                            </label>
                            <p class="text-xs text-gray-500 mt-1">ຍອດເງີນເຊື່ອ: {formatCurrency(cart.total - creditInitialPayment)}</p>
                        </div>
                        
                        <!-- Due Date -->
                        <div>
                            <label class="block">
                                <span class="text-sm font-medium text-gray-700 dark:text-gray-300">ກຳນົດຊຳລະ</span>
                                <div class="relative mt-1">
                                    <Calendar class="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                                    <input
                                        type="date"
                                        bind:value={creditDueDate}
                                        min={new Date().toISOString().split('T')[0]}
                                        class="w-full pl-10 pr-4 py-3 rounded-xl border border-gray-200 dark:border-gray-700 dark:bg-gray-800 focus:ring-2 focus:ring-primary-500"
                                    />
                                </div>
                            </label>
                        </div>
                        
                        <!-- Credit Summary -->
                        <div class="p-4 bg-gray-50 dark:bg-gray-800 rounded-xl space-y-2">
                            <div class="flex justify-between text-sm">
                                <span class="text-gray-600 dark:text-gray-400">ຍອດທັງໝົດ</span>
                                <span class="font-medium">{formatCurrency(cart.total)}</span>
                            </div>
                            <div class="flex justify-between text-sm">
                                <span class="text-gray-600 dark:text-gray-400">ເງີນມັດຈຳ</span>
                                <span class="font-medium text-green-600">{formatCurrency(creditInitialPayment)}</span>
                            </div>
                            <div class="flex justify-between text-sm font-bold border-t dark:border-gray-700 pt-2">
                                <span class="text-orange-600">ຍອດເຊື່ອ</span>
                                <span class="text-orange-600">{formatCurrency(cart.total - creditInitialPayment)}</span>
                            </div>
                        </div>
                    </div>
                {:else}
                    <div class="text-center py-8 text-gray-500">
                        <CreditCard
                            class="w-16 h-16 mx-auto mb-4 text-gray-300"
                        />
                        <p>{t('pos.waitingForCard')}</p>
                    </div>
                {/if}
            </div>

            <!-- Footer -->
            <div
                class="p-4 border-t border-gray-200 dark:border-gray-800 flex gap-3"
            >
                <button
                    onclick={() => (showPaymentModal = false)}
                    class="flex-1 py-3 rounded-xl border border-gray-200 dark:border-gray-700 font-medium hover:bg-gray-50"
                >
                    {t('common.cancel')}
                </button>
                <button
                    onclick={processPayment}
                    disabled={!canCheckout || isProcessing}
                    class={cn(
                        "flex-1 py-3 rounded-xl font-medium text-white transition-colors",
                        "bg-success-500 hover:bg-success-600",
                        "disabled:opacity-50 disabled:cursor-not-allowed",
                        "flex items-center justify-center gap-2",
                    )}
                >
                    {#if isProcessing}
                        <div
                            class="animate-spin rounded-full h-5 w-5 border-2 border-white border-t-transparent"
                        ></div>
                        <span>{t('common.processing')}</span>
                    {:else}
                        <Receipt class="w-5 h-5" />
                        <span>{t('pos.confirmPayment')}</span>
                    {/if}
                </button>
            </div>
        </div>
    </div>
{/if}

<!-- Discount Modal -->
{#if showDiscountModal}
    <div
        class="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50"
    >
        <div
            class="bg-white dark:bg-gray-900 rounded-2xl w-full max-w-md shadow-xl"
        >
            <!-- Header -->
            <div
                class="flex items-center justify-between p-4 border-b border-gray-200 dark:border-gray-800"
            >
                <h3 class="text-lg font-semibold text-gray-900 dark:text-white">
                    {t('pos.discountPromotion')}
                </h3>
                <button
                    onclick={() => (showDiscountModal = false)}
                    class="text-gray-400 hover:text-gray-600"
                >
                    <X class="w-6 h-6" />
                </button>
            </div>

            <!-- Content -->
            <div class="p-4 space-y-4">
                <!-- Discount Type -->
                <div class="grid grid-cols-2 gap-3">
                    <button
                        onclick={() => cart.setDiscount('PERCENTAGE', cart.discountValue)}
                        class={cn(
                            "flex flex-col items-center gap-2 p-4 rounded-xl border-2 transition-colors",
                            cart.discountType === 'PERCENTAGE'
                                ? "border-primary-500 bg-primary-50 dark:bg-primary-900/20"
                                : "border-gray-200 dark:border-gray-700 hover:border-primary-300",
                        )}
                    >
                        <Percent class="w-6 h-6" />
                        <span class="text-sm font-medium">{t('pos.discountPercent')}</span>
                    </button>
                    <button
                        onclick={() => cart.setDiscount('FIXED', cart.discountValue)}
                        class={cn(
                            "flex flex-col items-center gap-2 p-4 rounded-xl border-2 transition-colors",
                            cart.discountType === 'FIXED'
                                ? "border-primary-500 bg-primary-50 dark:bg-primary-900/20"
                                : "border-gray-200 dark:border-gray-700 hover:border-primary-300",
                        )}
                    >
                        <Tag class="w-6 h-6" />
                        <span class="text-sm font-medium">{t('pos.discountFixed')}</span>
                    </button>
                </div>

                <!-- Discount Value -->
                <div>
                    <label for="discount-value" class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                        {cart.discountType === 'PERCENTAGE' ? t('pos.discountPercentLabel') : t('pos.discountFixedLabel')}
                    </label>
                    {#if cart.discountType === 'PERCENTAGE'}
                        <input
                            id="discount-value"
                            type="number"
                            min="0"
                            max="100"
                            value={cart.discountValue}
                            oninput={(e) => cart.setDiscount('PERCENTAGE', Number(e.currentTarget.value))}
                            class="w-full px-4 py-3 rounded-xl border border-gray-200 dark:border-gray-700 dark:bg-gray-800 text-right text-xl font-bold focus:ring-2 focus:ring-primary-500"
                            placeholder="0"
                        />
                    {:else}
                        <input
                            id="discount-value"
                            type="text"
                            inputmode="decimal"
                            value={cart.discountValue > 0 ? new Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(cart.discountValue) : ''}
                            oninput={(e) => {
                                const raw = e.currentTarget.value.replace(/,/g, '');
                                const num = Math.round(parseFloat(raw) * 100) / 100;
                                if (!isNaN(num)) cart.setDiscount('FIXED', num);
                                else if (raw === '' || raw === '.') cart.setDiscount('FIXED', 0);
                            }}
                            onblur={(e) => {
                                const raw = e.currentTarget.value.replace(/,/g, '');
                                const num = parseFloat(raw) || 0;
                                e.currentTarget.value = num > 0 ? new Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(num) : '';
                                cart.setDiscount('FIXED', num);
                            }}
                            class="w-full px-4 py-3 rounded-xl border border-gray-200 dark:border-gray-700 dark:bg-gray-800 text-right text-xl font-bold focus:ring-2 focus:ring-primary-500"
                            placeholder="0.00"
                        />
                    {/if}
                </div>

                <!-- Quick Discount Buttons -->
                {#if cart.discountType === 'PERCENTAGE'}
                    <div class="flex flex-wrap gap-2">
                        {#each [5, 10, 15, 20, 25, 30] as percent (percent)}
                            <button
                                onclick={() => cart.setDiscount('PERCENTAGE', percent)}
                                class={cn(
                                    "px-4 py-2 rounded-lg text-sm font-medium transition-colors",
                                    cart.discountValue === percent
                                        ? "bg-primary-500 text-white"
                                        : "bg-gray-100 dark:bg-gray-800 hover:bg-gray-200",
                                )}
                            >
                                {percent}%
                            </button>
                        {/each}
                    </div>
                {:else}
                    <div class="flex flex-wrap gap-2">
                        {#each [50, 100, 200, 500, 1000] as amount (amount)}
                            <button
                                onclick={() => cart.setDiscount('FIXED', amount)}
                                class={cn(
                                    "px-4 py-2 rounded-lg text-sm font-medium transition-colors",
                                    cart.discountValue === amount
                                        ? "bg-primary-500 text-white"
                                        : "bg-gray-100 dark:bg-gray-800 hover:bg-gray-200",
                                )}
                            >
                                {formatCurrency(amount)}
                            </button>
                        {/each}
                    </div>
                {/if}

                <!-- Preview -->
                {#if cart.discountAmount > 0}
                    <div class="p-4 bg-error-50 dark:bg-error-900/20 rounded-xl">
                        <div class="flex justify-between text-sm mb-2">
                            <span class="text-gray-600 dark:text-gray-400">{t('pos.subtotalBeforeDiscount')}</span>
                            <span>{formatCurrency(cart.subtotal)}</span>
                        </div>
                        <div class="flex justify-between text-error-600 font-medium">
                            <span>{t('pos.discountAmount')}</span>
                            <span>-{formatCurrency(cart.discountAmount)}</span>
                        </div>
                    </div>
                {/if}
            </div>

            <!-- Footer -->
            <div
                class="p-4 border-t border-gray-200 dark:border-gray-800 flex gap-3"
            >
                <button
                    onclick={() => {
                        cart.setDiscount(null, 0);
                        showDiscountModal = false;
                    }}
                    class="flex-1 py-3 rounded-xl border border-gray-200 dark:border-gray-700 font-medium hover:bg-gray-50 dark:hover:bg-gray-800"
                >
                    {t('pos.clearDiscount')}
                </button>
                <button
                    onclick={() => (showDiscountModal = false)}
                    class="flex-1 py-3 rounded-xl bg-primary-500 hover:bg-primary-600 text-white font-medium"
                >
                    {t('common.confirm')}
                </button>
            </div>
        </div>
    </div>
{/if}

<!-- Customer Selection Modal -->
{#if showCustomerModal}
    <div
        class="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50"
    >
        <div
            class="bg-white dark:bg-gray-900 rounded-2xl w-full max-w-lg shadow-xl max-h-[80vh] flex flex-col"
        >
            <!-- Header -->
            <div
                class="flex items-center justify-between p-4 border-b border-gray-200 dark:border-gray-800"
            >
                <h3 class="text-lg font-semibold text-gray-900 dark:text-white">
                    {t('pos.selectCustomerTitle')}
                </h3>
                <button
                    onclick={() => (showCustomerModal = false)}
                    class="text-gray-400 hover:text-gray-600"
                >
                    <X class="w-6 h-6" />
                </button>
            </div>

            <!-- Search -->
            <div class="p-4 border-b border-gray-200 dark:border-gray-800">
                <div class="relative">
                    <Search class="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                    <input
                        type="text"
                        placeholder={t('pos.searchCustomer')}
                        bind:value={customerSearchQuery}
                        class="w-full pl-10 pr-4 py-3 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 focus:ring-2 focus:ring-primary-500"
                    />
                </div>
            </div>

            <!-- Customer List -->
            <div class="flex-1 overflow-auto p-4">
                <!-- Walk-in Customer Option -->
                <button
                    onclick={() => {
                        cart.setCustomer(null);
                        showCustomerModal = false;
                    }}
                    class={cn(
                        "w-full flex items-center gap-3 p-3 rounded-xl border mb-3 transition-colors",
                        !cart.customer
                            ? "border-primary-500 bg-primary-50 dark:bg-primary-900/20"
                            : "border-gray-200 dark:border-gray-700 hover:border-primary-300"
                    )}
                >
                    <div class="w-10 h-10 rounded-full bg-gray-100 dark:bg-gray-800 flex items-center justify-center">
                        <User class="w-5 h-5 text-gray-400" />
                    </div>
                    <div class="text-left">
                        <p class="font-medium text-gray-900 dark:text-white">{t('pos.walkIn')}</p>
                        <p class="text-xs text-gray-500">{t('pos.noCustomerInfo')}</p>
                    </div>
                </button>

                {#if $customersQuery.isLoading}
                    <div class="text-center py-8 text-gray-500">
                        <div class="animate-spin rounded-full h-8 w-8 border-2 border-primary-500 border-t-transparent mx-auto mb-2"></div>
                        <p>{t('common.loading')}</p>
                    </div>
                {:else if filteredCustomers.length === 0}
                    <div class="text-center py-8 text-gray-500">
                        <User class="w-12 h-12 mx-auto mb-2 text-gray-300" />
                        <p>{t('pos.noCustomersFound')}</p>
                    </div>
                {:else}
                    <div class="space-y-2">
                        {#each filteredCustomers as customer (customer.id)}
                            <button
                                onclick={() => {
                                    cart.setCustomer(customer);
                                    showCustomerModal = false;
                                }}
                                class={cn(
                                    "w-full flex items-center gap-3 p-3 rounded-xl border transition-colors",
                                    cart.customer?.id === customer.id
                                        ? "border-primary-500 bg-primary-50 dark:bg-primary-900/20"
                                        : "border-gray-200 dark:border-gray-700 hover:border-primary-300"
                                )}
                            >
                                <div class="w-10 h-10 rounded-full bg-primary-100 dark:bg-primary-900 flex items-center justify-center">
                                    <span class="text-primary-600 font-semibold">
                                        {customer.name?.charAt(0)?.toUpperCase() || 'C'}
                                    </span>
                                </div>
                                <div class="text-left flex-1">
                                    <p class="font-medium text-gray-900 dark:text-white">{customer.name}</p>
                                    <p class="text-xs text-gray-500">
                                        {customer.phone || customer.email || t('pos.noContact')}
                                    </p>
                                </div>
                                {#if customer.loyaltyPoints}
                                    <span class="text-xs bg-warning-100 text-warning-700 px-2 py-1 rounded-full">
                                        {customer.loyaltyPoints} {t('pos.points')}
                                    </span>
                                {/if}
                            </button>
                        {/each}
                    </div>
                {/if}
            </div>

            <!-- Footer -->
            <div class="p-4 border-t border-gray-200 dark:border-gray-800">
                <button
                    onclick={() => (showCustomerModal = false)}
                    class="w-full py-3 rounded-xl border border-gray-200 dark:border-gray-700 font-medium hover:bg-gray-50 dark:hover:bg-gray-800"
                >
                    {t('common.close')}
                </button>
            </div>
        </div>
    </div>
{/if}

<!-- Held Bills Modal -->
{#if showHeldBillsModal}
    <div
        class="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50"
    >
        <div
            class="bg-white dark:bg-gray-900 rounded-2xl w-full max-w-lg shadow-xl max-h-[80vh] flex flex-col"
        >
            <!-- Header -->
            <div
                class="flex items-center justify-between p-4 border-b border-gray-200 dark:border-gray-800"
            >
                <h3 class="text-lg font-semibold text-gray-900 dark:text-white">
                    {t('pos.heldBills')} ({heldBills.length})
                </h3>
                <button
                    onclick={() => (showHeldBillsModal = false)}
                    class="text-gray-400 hover:text-gray-600"
                >
                    <X class="w-6 h-6" />
                </button>
            </div>

            <!-- Held Bills List -->
            <div class="flex-1 overflow-auto p-4">
                {#if heldBills.length === 0}
                    <div class="text-center py-8 text-gray-500">
                        <Pause class="w-12 h-12 mx-auto mb-2 text-gray-300" />
                        <p>{t('pos.noHeldBills')}</p>
                    </div>
                {:else}
                    <div class="space-y-3">
                        {#each heldBills as bill (bill.id)}
                            <div class="bg-gray-50 dark:bg-gray-800 rounded-xl p-4">
                                <div class="flex items-start justify-between mb-2">
                                    <div>
                                        <p class="font-medium text-gray-900 dark:text-white">
                                            {bill.items.length} {t('pos.items')}
                                        </p>
                                        <p class="text-xs text-gray-500">
                                            {new Date(bill.timestamp).toLocaleString()}
                                        </p>
                                        {#if bill.customer}
                                            <p class="text-xs text-primary-600">{bill.customer.name}</p>
                                        {/if}
                                    </div>
                                    <p class="font-bold text-primary-600">
                                        {formatCurrency(bill.items.reduce((sum, item) => sum + ((item.product.price || item.product.salePrice || 0) * item.quantity), 0))}
                                    </p>
                                </div>
                                <div class="text-xs text-gray-500 mb-3">
                                    {bill.items.map(i => `${i.product.name} x${i.quantity}`).join(', ')}
                                </div>
                                <div class="flex gap-2">
                                    <button
                                        onclick={() => recallBill(bill)}
                                        class="flex-1 py-2 rounded-lg bg-primary-500 hover:bg-primary-600 text-white text-sm font-medium flex items-center justify-center gap-1"
                                    >
                                        <Play class="w-4 h-4" />
                                        {t('pos.recall')}
                                    </button>
                                    <button
                                        onclick={() => deleteHeldBill(bill.id)}
                                        class="py-2 px-4 rounded-lg bg-error-100 hover:bg-error-200 text-error-700 text-sm font-medium"
                                    >
                                        <Trash2 class="w-4 h-4" />
                                    </button>
                                </div>
                            </div>
                        {/each}
                    </div>
                {/if}
            </div>

            <!-- Footer -->
            <div class="p-4 border-t border-gray-200 dark:border-gray-800">
                <button
                    onclick={() => (showHeldBillsModal = false)}
                    class="w-full py-3 rounded-xl border border-gray-200 dark:border-gray-700 font-medium hover:bg-gray-50 dark:hover:bg-gray-800"
                >
                    {t('common.close')}
                </button>
            </div>
        </div>
    </div>
{/if}

<!-- Receipt Print Modal -->
<ReceiptPrint 
    data={receiptData} 
    show={showReceiptModal} 
    onClose={() => { showReceiptModal = false; receiptData = null; }}
    autoPrint={true}
/>

<!-- Flying add-to-cart animation -->
{#each flyingItems as fly (fly.id)}
    <div
        class="fly-to-cart"
        style="--start-x: {fly.x}px; --start-y: {fly.y}px;"
    >
        <div class="w-10 h-10 bg-primary-500 text-white rounded-full flex items-center justify-center shadow-xl text-lg font-bold">
            +1
        </div>
    </div>
{/each}

<style>
    .scrollbar-hide::-webkit-scrollbar {
        display: none;
    }
    .scrollbar-hide {
        -ms-overflow-style: none;
        scrollbar-width: none;
    }

    /* Fly-to-cart animation */
    .fly-to-cart {
        position: fixed;
        left: var(--start-x);
        top: var(--start-y);
        z-index: 9999;
        pointer-events: none;
        animation: flyToCart 0.55s cubic-bezier(0.22, 0.68, 0, 1.2) forwards;
    }

    @keyframes flyToCart {
        0% {
            transform: translate(-50%, -50%) scale(1);
            opacity: 1;
        }
        60% {
            transform: translate(calc(100vw - 26rem - 50%), -60px) scale(0.6);
            opacity: 0.8;
        }
        100% {
            transform: translate(calc(100vw - 26rem - 50%), 0px) scale(0.2);
            opacity: 0;
        }
    }
</style>
