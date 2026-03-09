// ═══════════════════════════════════════════════════════════════════════════
// KPOS - TanStack Query Key Factory
// Centralized query key management to prevent typos and ensure consistent
// cache invalidation across the application.
//
// Usage:
//   import { queryKeys } from '$lib/api/query-keys';
//   createQuery({ queryKey: queryKeys.products.list(storeId), ... })
//   queryClient.invalidateQueries({ queryKey: queryKeys.products.all })
// ═══════════════════════════════════════════════════════════════════════════

export const queryKeys = {
    // ─── Products ────────────────────────────────────────────────────────
    products: {
        all: ['products'] as const,
        list: (storeId?: string) => ['products', storeId] as const,
        detail: (id: string) => ['products', 'detail', id] as const,
        barcodes: () => ['products', 'barcodes'] as const,
        skus: (productId?: string) => ['products', 'skus', productId] as const,
        priceLevels: () => ['products', 'price-levels'] as const,
    },

    // ─── Categories ──────────────────────────────────────────────────────
    categories: {
        all: ['categories'] as const,
        list: (storeId?: string) => ['categories', storeId] as const,
        detail: (id: string) => ['categories', 'detail', id] as const,
    },

    // ─── Inventory ───────────────────────────────────────────────────────
    inventory: {
        all: ['inventory'] as const,
        list: (storeId?: string) => ['inventory', storeId] as const,
        stats: (storeId?: string) => ['inventory-stats', storeId] as const,
        movements: () => ['inventory', 'movements'] as const,
        alerts: () => ['inventory', 'alerts'] as const,
        vendors: () => ['inventory', 'vendors'] as const,
        purchaseOrders: () => ['inventory', 'purchase-orders'] as const,
        stockTransfers: () => ['inventory', 'stock-transfers'] as const,
        stockCounts: () => ['inventory', 'stock-counts'] as const,
        expiring: () => ['inventory', 'expiring'] as const,
        outOfStock: () => ['inventory', 'out-of-stock'] as const,
        stockIn: () => ['inventory', 'stock-in'] as const,
        stockOut: () => ['inventory', 'stock-out'] as const,
        adjustments: () => ['inventory', 'adjustments'] as const,
        transfers: () => ['inventory', 'transfers'] as const,
    },

    // ─── Sales ───────────────────────────────────────────────────────────
    sales: {
        all: ['sales'] as const,
        list: (storeId?: string) => ['sales', storeId] as const,
        detail: (id: string) => ['sales', 'detail', id] as const,
        daily: (date?: string) => ['sales', 'daily', date] as const,
        held: (storeId?: string) => ['sales', 'held', storeId] as const,
        credit: () => ['sales', 'credit'] as const,
        shifts: () => ['sales', 'shifts'] as const,
        registers: () => ['sales', 'registers'] as const,
    },

    // ─── Customers ───────────────────────────────────────────────────────
    customers: {
        all: ['customers'] as const,
        list: (storeId?: string) => ['customers', storeId] as const,
        detail: (id: string) => ['customers', 'detail', id] as const,
        loyalty: () => ['customers', 'loyalty'] as const,
        points: (customerId: string) => ['customers', 'points', customerId] as const,
    },

    // ─── Promotions ──────────────────────────────────────────────────────
    promotions: {
        all: ['promotions'] as const,
        list: () => ['promotions', 'list'] as const,
        detail: (id: string) => ['promotions', 'detail', id] as const,
        coupons: () => ['promotions', 'coupons'] as const,
        discounts: () => ['promotions', 'discounts'] as const,
    },

    // ─── Dashboard ───────────────────────────────────────────────────────
    dashboard: {
        all: ['dashboard'] as const,
        stats: (storeId?: string) => ['dashboard', storeId] as const,
        lowStock: () => ['dashboard', 'low-stock'] as const,
        salesChart: (period?: string) => ['dashboard', 'sales-chart', period] as const,
        topProducts: () => ['dashboard', 'top-products'] as const,
        recentTransactions: () => ['dashboard', 'recent-transactions'] as const,
    },

    // ─── Payments ────────────────────────────────────────────────────────
    payments: {
        all: ['payments'] as const,
        list: () => ['payments', 'list'] as const,
        detail: (id: string) => ['payments', 'detail', id] as const,
        methods: () => ['payments', 'methods'] as const,
        settlements: () => ['payments', 'settlements'] as const,
    },

    // ─── Documents ───────────────────────────────────────────────────────
    documents: {
        all: ['documents'] as const,
        invoices: () => ['documents', 'invoices'] as const,
        taxInvoices: () => ['documents', 'tax-invoices'] as const,
    },

    // ─── Reports ─────────────────────────────────────────────────────────
    reports: {
        all: ['reports'] as const,
        summary: () => ['reports', 'summary'] as const,
        sales: (period?: string) => ['reports', 'sales', period] as const,
        products: (period?: string) => ['reports', 'products', period] as const,
        inventory: () => ['reports', 'inventory'] as const,
        financial: (period?: string) => ['reports', 'financial', period] as const,
        customers: () => ['reports', 'customers'] as const,
        staff: (period?: string) => ['reports', 'staff', period] as const,
        payments: () => ['reports', 'payments'] as const,
    },

    // ─── Staff ───────────────────────────────────────────────────────────
    staff: {
        all: ['staff'] as const,
        list: () => ['staff', 'list'] as const,
        detail: (id: string) => ['staff', 'detail', id] as const,
        roles: () => ['staff', 'roles'] as const,
    },

    // ─── Branches ────────────────────────────────────────────────────────
    branches: {
        all: ['branches'] as const,
        list: () => ['branches', 'list'] as const,
        detail: (id: string) => ['branches', 'detail', id] as const,
    },

    // ─── Stores ──────────────────────────────────────────────────────────
    stores: {
        all: ['stores'] as const,
        list: () => ['stores', 'list'] as const,
        detail: (id: string) => ['stores', 'detail', id] as const,
        myStores: () => ['stores', 'my-stores'] as const,
        requests: () => ['stores', 'requests'] as const,
    },

    // ─── Restaurant ──────────────────────────────────────────────────────
    restaurant: {
        all: ['restaurant'] as const,
        tables: () => ['restaurant', 'tables'] as const,
        orders: () => ['restaurant', 'orders'] as const,
        kitchen: () => ['restaurant', 'kitchen'] as const,
        reservations: () => ['restaurant', 'reservations'] as const,
        zones: () => ['restaurant', 'zones'] as const,
    },

    // ─── Settings ────────────────────────────────────────────────────────
    settings: {
        all: ['settings'] as const,
        category: (category: string) => ['settings', category] as const,
        enums: (category?: string) => ['settings', 'enums', category] as const,
    },

    // ─── Admin ───────────────────────────────────────────────────────────
    admin: {
        all: ['admin'] as const,
        requests: () => ['admin', 'requests'] as const,
        branches: () => ['admin', 'branches'] as const,
        users: () => ['admin', 'users'] as const,
        roles: () => ['admin', 'roles'] as const,
        rules: () => ['admin', 'rules'] as const,
        rulesMatrix: () => ['admin', 'rules-matrix'] as const,
        audit: () => ['admin', 'audit'] as const,
        enums: () => ['admin', 'enums'] as const,
    },
} as const;
