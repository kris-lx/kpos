// ═══════════════════════════════════════════════════════════════════════════
// KPOS - Cart Store (Svelte 5 Runes)
// ═══════════════════════════════════════════════════════════════════════════

import type { Product, Customer } from '$api';

export interface CartItem {
    product: Product;
    quantity: number;
    discount: number;
    notes?: string;
}

function createCartStore() {
    let items = $state<CartItem[]>([]);
    let customer = $state<Customer | null>(null);
    let discountType = $state<'PERCENTAGE' | 'FIXED' | null>(null);
    let discountValue = $state(0);
    let notes = $state('');

    // Computed values
    const itemCount = $derived(items.reduce((sum, item) => sum + item.quantity, 0));

    const subtotal = $derived(
        items.reduce((sum, item) => {
            // Use price first, fallback to salePrice for backward compatibility
            const unitPrice = item.product.price || item.product.salePrice || 0;
            const itemTotal = unitPrice * item.quantity;
            return sum + itemTotal - item.discount;
        }, 0)
    );

    const discountAmount = $derived.by(() => {
        if (!discountType || !discountValue) return 0;
        if (discountType === 'PERCENTAGE') {
            return (subtotal * discountValue) / 100;
        }
        return discountValue;
    });

    const taxRate = 7; // 7% VAT
    const taxAmount = $derived.by(() => {
        const afterDiscount = subtotal - discountAmount;
        return (afterDiscount * taxRate) / 100;
    });

    const total = $derived.by(() => {
        return subtotal - discountAmount + taxAmount;
    });

    // Check stock validation result
    type AddItemResult = { success: true } | { success: false; message: string; availableStock: number };

    function addItem(product: Product, quantity = 1): AddItemResult {
        const existingIndex = items.findIndex((item) => item.product.id === product.id);
        const currentQty = existingIndex >= 0 ? items[existingIndex].quantity : 0;
        const newQty = currentQty + quantity;
        
        // Check stock - product.stock is the available stock quantity
        const availableStock = product.stock ?? Infinity;
        if (availableStock !== Infinity && newQty > availableStock) {
            return {
                success: false,
                message: `ສິນຄ້າ "${product.name}" ມີສະຕ໋ອກພຽງ ${availableStock} ໜ່ວຍ`,
                availableStock
            };
        }

        if (existingIndex >= 0) {
            items[existingIndex].quantity = newQty;
        } else {
            items = [...items, { product, quantity, discount: 0 }];
        }
        
        return { success: true };
    }

    function updateQuantity(productId: string, quantity: number): AddItemResult {
        const index = items.findIndex((item) => item.product.id === productId);
        if (index >= 0) {
            if (quantity <= 0) {
                items = items.filter((_, i) => i !== index);
                return { success: true };
            }
            
            // Check stock
            const product = items[index].product;
            const availableStock = product.stock ?? Infinity;
            if (availableStock !== Infinity && quantity > availableStock) {
                return {
                    success: false,
                    message: `ສິນຄ້າ "${product.name}" ມີສະຕ໋ອກພຽງ ${availableStock} ໜ່ວຍ`,
                    availableStock
                };
            }
            
            items[index].quantity = quantity;
        }
        return { success: true };
    }

    function removeItem(productId: string): void {
        items = items.filter((item) => item.product.id !== productId);
    }

    function setItemDiscount(productId: string, discount: number): void {
        const index = items.findIndex((item) => item.product.id === productId);
        if (index >= 0) {
            items[index].discount = discount;
        }
    }

    function setCustomer(c: Customer | null): void {
        customer = c;
    }

    function setDiscount(type: 'PERCENTAGE' | 'FIXED' | null, value: number): void {
        discountType = type;
        discountValue = value;
    }

    function setNotes(n: string): void {
        notes = n;
    }

    function clear(): void {
        items = [];
        customer = null;
        discountType = null;
        discountValue = 0;
        notes = '';
    }

    function toSaleInput() {
        return {
            items: items.map((item) => ({
                productId: item.product.id,
                quantity: item.quantity,
                price: item.product.price || item.product.salePrice || 0,
                discount: item.discount,
            })),
            customerId: customer?.id,
            discountType,
            discountValue,
            notes,
        };
    }

    return {
        get items() { return items; },
        get customer() { return customer; },
        get discountType() { return discountType; },
        get discountValue() { return discountValue; },
        get notes() { return notes; },
        get itemCount() { return itemCount; },
        get subtotal() { return subtotal; },
        get discountAmount() { return discountAmount; },
        get taxAmount() { return taxAmount; },
        get total() { return total; },
        addItem,
        updateQuantity,
        removeItem,
        setItemDiscount,
        setCustomer,
        setDiscount,
        setNotes,
        clear,
        toSaleInput,
    };
}

export const cart = createCartStore();
