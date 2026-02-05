// ═══════════════════════════════════════════════════════════════════════════
// KPOS - API Client
// ═══════════════════════════════════════════════════════════════════════════

import ky, { type BeforeRequestHook, type AfterResponseHook } from 'ky';
import { PUBLIC_API_URL } from '$env/static/public';
import { browser } from '$app/environment';

const API_URL = PUBLIC_API_URL || 'http://localhost:5000/api/v1';
const ACCESS_TOKEN_KEY = 'kpos_access_token';
const ACTIVE_STORE_KEY = 'kpos_active_store';

const beforeRequest: BeforeRequestHook = (request) => {
    if (browser) {
        const token = localStorage.getItem(ACCESS_TOKEN_KEY);
        if (token) {
            request.headers.set('Authorization', `Bearer ${token}`);
        }
        
        // Include active store header for branch/store filtering
        const activeStore = localStorage.getItem(ACTIVE_STORE_KEY);
        if (activeStore) {
            request.headers.set('X-Active-Store', activeStore);
        }
    }
};

const afterResponse: AfterResponseHook = async (_request, _options, response) => {
    if (response.status === 401 && browser) {
        // Clear local storage and redirect to login
        localStorage.removeItem(ACCESS_TOKEN_KEY);
        localStorage.removeItem('kpos_refresh_token');
        localStorage.removeItem('kpos_user');
        window.location.href = '/login';
    }
    return response;
};

export const api = ky.create({
    prefixUrl: API_URL,
    timeout: 30000,
    hooks: {
        beforeRequest: [beforeRequest],
        afterResponse: [afterResponse],
    },
});

// API Response Types
export interface ApiResponse<T> {
    success: boolean;
    data?: T;
    error?: {
        code: string;
        message: string;
        details?: unknown;
    };
    meta?: {
        page: number;
        limit: number;
        total: number;
        totalPages: number;
    };
}

// Auth API
export const authApi = {
    login: (email: string, password: string) =>
        api.post('auth/login', { json: { email, password } }).json<ApiResponse<{
            accessToken: string;
            refreshToken: string;
            user: {
                id: string;
                email: string;
                name: string;
                role: string;
                branchId: string;
            };
        }>>(),

    register: (data: { email: string; password: string; name: string; branchId: string }) =>
        api.post('auth/register', { json: data }).json<ApiResponse<{ id: string }>>(),

    refresh: (refreshToken: string) =>
        api.post('auth/refresh', { json: { refreshToken } }).json<ApiResponse<{
            accessToken: string;
            refreshToken: string;
        }>>(),

    logout: () => api.post('auth/logout').json<ApiResponse<{ message: string }>>(),

    me: () => api.get('auth/me').json<ApiResponse<{
        userId: string;
        email: string;
        name: string;
        role: string;
        branchId: string;
    }>>(),
};

// Products API
export const productsApi = {
    list: (params?: { page?: number; limit?: number; search?: string; categoryId?: string }) =>
        api.get('products', { searchParams: params }).json<ApiResponse<Product[]>>(),

    get: (id: string) =>
        api.get(`products/${id}`).json<ApiResponse<Product>>(),

    lookup: (code: string) =>
        api.get(`products/lookup/${code}`).json<ApiResponse<Product>>(),

    create: (data: Partial<Product>) =>
        api.post('products', { json: data }).json<ApiResponse<Product>>(),

    update: (id: string, data: Partial<Product>) =>
        api.put(`products/${id}`, { json: data }).json<ApiResponse<Product>>(),

    delete: (id: string) =>
        api.delete(`products/${id}`).json<ApiResponse<{ message: string }>>(),
};

// Categories API
export const categoriesApi = {
    list: () => api.get('categories').json<ApiResponse<Category[]>>(),
    get: (id: string) => api.get(`categories/${id}`).json<ApiResponse<Category>>(),
    create: (data: Partial<Category>) => api.post('categories', { json: data }).json<ApiResponse<Category>>(),
    update: (id: string, data: Partial<Category>) => api.put(`categories/${id}`, { json: data }).json<ApiResponse<Category>>(),
    delete: (id: string) => api.delete(`categories/${id}`).json<ApiResponse<{ message: string }>>(),
};

// Sales API
export const salesApi = {
    create: (data: SaleInput) =>
        api.post('sales', { json: data }).json<ApiResponse<Sale>>(),

    list: (params?: { page?: number; limit?: number; startDate?: string; endDate?: string }) =>
        api.get('sales', { searchParams: params }).json<ApiResponse<Sale[]>>(),

    get: (id: string) =>
        api.get(`sales/${id}`).json<ApiResponse<Sale>>(),

    void: (id: string, reason: string) =>
        api.post(`sales/${id}/void`, { json: { reason } }).json<ApiResponse<{ message: string }>>(),

    dailySummary: (date?: string) =>
        api.get('sales/summary/daily', { searchParams: date ? { date } : {} }).json<ApiResponse<{
            date: string;
            salesCount: number;
            totalRevenue: number;
            voidedCount: number;
        }>>(),
};

// Customers API
export const customersApi = {
    list: (params?: { page?: number; limit?: number; search?: string }) =>
        api.get('customers', { searchParams: params }).json<ApiResponse<Customer[]>>(),

    get: (id: string) =>
        api.get(`customers/${id}`).json<ApiResponse<Customer>>(),

    lookup: (code: string) =>
        api.get(`customers/lookup/${code}`).json<ApiResponse<Customer>>(),

    create: (data: Partial<Customer>) =>
        api.post('customers', { json: data }).json<ApiResponse<Customer>>(),

    update: (id: string, data: Partial<Customer>) =>
        api.put(`customers/${id}`, { json: data }).json<ApiResponse<Customer>>(),
};

// Settings API
export const settingsApi = {
    get: () => api.get('settings').json<ApiResponse<Record<string, unknown>>>(),
    getCategory: (category: string) => api.get(`settings/category/${category}`).json<ApiResponse<Record<string, unknown>>>(),
    update: (category: string, key: string, value: unknown) =>
        api.put(`settings/${category}/${key}`, { json: { value } }).json<ApiResponse<{ key: string; value: unknown }>>(),
    bulkUpdate: (settings: Record<string, Record<string, unknown>>) =>
        api.post('settings/bulk', { json: { settings } }).json<ApiResponse<unknown[]>>(),
};

// Dashboard API
export const dashboardApi = {
    stats: (branchId?: string) =>
        api.get('dashboard/stats', { searchParams: branchId ? { branchId } : {} }).json<ApiResponse<{
            todaySales: number;
            todayOrders: number;
            avgOrderValue: number;
            totalProducts: number;
            totalCustomers: number;
            lowStockCount: number;
        }>>(),
    salesChart: (period?: string) =>
        api.get('dashboard/sales-chart', { searchParams: period ? { period } : {} }).json<ApiResponse<Array<{ date: string; total: number }>>>(),
    recentTransactions: (limit?: number) =>
        api.get('dashboard/recent-transactions', { searchParams: limit ? { limit } : {} }).json<ApiResponse<Sale[]>>(),
    topProducts: (limit?: number) =>
        api.get('dashboard/top-products', { searchParams: limit ? { limit } : {} }).json<ApiResponse<Product[]>>(),
};

// Inventory API
export const inventoryApi = {
    list: (params?: { branchId?: string; lowStock?: boolean }) =>
        api.get('inventory', { searchParams: params }).json<ApiResponse<unknown[]>>(),
    movements: (params?: { productId?: string; type?: string; page?: number }) =>
        api.get('inventory/movements', { searchParams: params }).json<ApiResponse<unknown[]>>(),
    adjust: (data: { productId: string; branchId: string; quantity: number; type: string; reason: string }) =>
        api.post('inventory/adjust', { json: data }).json<ApiResponse<unknown>>(),
    transfer: (data: { productId: string; fromBranchId: string; toBranchId: string; quantity: number }) =>
        api.post('inventory/transfer', { json: data }).json<ApiResponse<unknown>>(),
    alerts: () => api.get('inventory/alerts').json<ApiResponse<unknown[]>>(),
    expiring: (days?: number) => api.get('inventory/expiring', { searchParams: days ? { days } : {} }).json<ApiResponse<unknown[]>>(),
    // Vendors
    vendors: {
        list: () => api.get('inventory/vendors').json<ApiResponse<Vendor[]>>(),
        get: (id: string) => api.get(`inventory/vendors/${id}`).json<ApiResponse<Vendor>>(),
        create: (data: Partial<Vendor>) => api.post('inventory/vendors', { json: data }).json<ApiResponse<Vendor>>(),
        update: (id: string, data: Partial<Vendor>) => api.put(`inventory/vendors/${id}`, { json: data }).json<ApiResponse<Vendor>>(),
        delete: (id: string) => api.delete(`inventory/vendors/${id}`).json<ApiResponse<{ message: string }>>(),
    },
    // Purchase Orders
    purchaseOrders: {
        list: (params?: { vendorId?: string; status?: string; page?: number }) =>
            api.get('inventory/purchase-orders', { searchParams: params }).json<ApiResponse<PurchaseOrder[]>>(),
        get: (id: string) => api.get(`inventory/purchase-orders/${id}`).json<ApiResponse<PurchaseOrder>>(),
        create: (data: Partial<PurchaseOrder>) => api.post('inventory/purchase-orders', { json: data }).json<ApiResponse<PurchaseOrder>>(),
        update: (id: string, data: Partial<PurchaseOrder>) => api.put(`inventory/purchase-orders/${id}`, { json: data }).json<ApiResponse<PurchaseOrder>>(),
        updateStatus: (id: string, status: string) => api.patch(`inventory/purchase-orders/${id}/status`, { json: { status } }).json<ApiResponse<PurchaseOrder>>(),
        delete: (id: string) => api.delete(`inventory/purchase-orders/${id}`).json<ApiResponse<{ message: string }>>(),
    },
    // Stock Transfers
    stockTransfers: {
        list: (params?: { status?: string; page?: number }) =>
            api.get('inventory/stock-transfers', { searchParams: params }).json<ApiResponse<unknown[]>>(),
        create: (data: unknown) => api.post('inventory/stock-transfers', { json: data }).json<ApiResponse<unknown>>(),
    },
};

// Branches API
export const branchesApi = {
    list: () => api.get('branches').json<ApiResponse<Branch[]>>(),
    get: (id: string) => api.get(`branches/${id}`).json<ApiResponse<Branch>>(),
    create: (data: Partial<Branch>) => api.post('branches', { json: data }).json<ApiResponse<Branch>>(),
    update: (id: string, data: Partial<Branch>) => api.put(`branches/${id}`, { json: data }).json<ApiResponse<Branch>>(),
    delete: (id: string) => api.delete(`branches/${id}`).json<ApiResponse<{ message: string }>>(),
};

// Staff API
export const staffApi = {
    list: (params?: { page?: number; limit?: number; search?: string }) =>
        api.get('staff', { searchParams: params }).json<ApiResponse<Staff[]>>(),
    get: (id: string) => api.get(`staff/${id}`).json<ApiResponse<Staff>>(),
    create: (data: Partial<Staff>) => api.post('staff', { json: data }).json<ApiResponse<Staff>>(),
    update: (id: string, data: Partial<Staff>) => api.put(`staff/${id}`, { json: data }).json<ApiResponse<Staff>>(),
    delete: (id: string) => api.delete(`staff/${id}`).json<ApiResponse<{ message: string }>>(),
    roles: () => api.get('staff/roles').json<ApiResponse<Role[]>>(),
};

// Roles API
export const rolesApi = {
    list: () => api.get('roles').json<ApiResponse<Role[]>>(),
    get: (id: string) => api.get(`roles/${id}`).json<ApiResponse<Role>>(),
    create: (data: Partial<Role>) => api.post('roles', { json: data }).json<ApiResponse<Role>>(),
    update: (id: string, data: Partial<Role>) => api.put(`roles/${id}`, { json: data }).json<ApiResponse<Role>>(),
    delete: (id: string) => api.delete(`roles/${id}`).json<ApiResponse<{ message: string }>>(),
    permissions: () => api.get('roles/permissions').json<ApiResponse<string[]>>(),
};

// Shifts API
export const shiftsApi = {
    list: (params?: { status?: string; page?: number }) =>
        api.get('sales/shifts', { searchParams: params }).json<ApiResponse<Shift[]>>(),
    current: () => api.get('sales/shifts/current').json<ApiResponse<Shift | null>>(),
    get: (id: string) => api.get(`sales/shifts/${id}`).json<ApiResponse<Shift>>(),
    open: (data: { openingBalance: number; registerId?: string; notes?: string }) =>
        api.post('sales/shifts/open', { json: data }).json<ApiResponse<Shift>>(),
    close: (id: string, data: { closingBalance: number; notes?: string }) =>
        api.post(`sales/shifts/${id}/close`, { json: data }).json<ApiResponse<Shift>>(),
    addCashMovement: (id: string, data: { type: string; amount: number; reason?: string }) =>
        api.post(`sales/shifts/${id}/cash-movement`, { json: data }).json<ApiResponse<unknown>>(),
};

// Cash Registers API
export const registersApi = {
    list: (params?: { branchId?: string }) =>
        api.get('sales/registers', { searchParams: params }).json<ApiResponse<CashRegister[]>>(),
    get: (id: string) => api.get(`sales/registers/${id}`).json<ApiResponse<CashRegister>>(),
    create: (data: Partial<CashRegister>) => api.post('sales/registers', { json: data }).json<ApiResponse<CashRegister>>(),
    update: (id: string, data: Partial<CashRegister>) => api.put(`sales/registers/${id}`, { json: data }).json<ApiResponse<CashRegister>>(),
    delete: (id: string) => api.delete(`sales/registers/${id}`).json<ApiResponse<{ message: string }>>(),
};

// Held Sales API
export const heldSalesApi = {
    list: () => api.get('sales/held').json<ApiResponse<HeldSale[]>>(),
    get: (id: string) => api.get(`sales/held/${id}`).json<ApiResponse<HeldSale>>(),
    create: (data: Partial<HeldSale>) => api.post('sales/held', { json: data }).json<ApiResponse<HeldSale>>(),
    delete: (id: string) => api.delete(`sales/held/${id}`).json<ApiResponse<{ message: string }>>(),
};

// Promotions API
export const promotionsApi = {
    list: () => api.get('promotions').json<ApiResponse<Promotion[]>>(),
    get: (id: string) => api.get(`promotions/${id}`).json<ApiResponse<Promotion>>(),
    create: (data: Partial<Promotion>) => api.post('promotions', { json: data }).json<ApiResponse<Promotion>>(),
    update: (id: string, data: Partial<Promotion>) => api.put(`promotions/${id}`, { json: data }).json<ApiResponse<Promotion>>(),
    delete: (id: string) => api.delete(`promotions/${id}`).json<ApiResponse<{ message: string }>>(),
    // Coupons
    coupons: {
        list: () => api.get('promotions/coupons').json<ApiResponse<Coupon[]>>(),
        validate: (code: string) => api.post('promotions/coupons/validate', { json: { code } }).json<ApiResponse<Coupon>>(),
        create: (data: Partial<Coupon>) => api.post('promotions/coupons', { json: data }).json<ApiResponse<Coupon>>(),
        update: (id: string, data: Partial<Coupon>) => api.put(`promotions/coupons/${id}`, { json: data }).json<ApiResponse<Coupon>>(),
        delete: (id: string) => api.delete(`promotions/coupons/${id}`).json<ApiResponse<{ message: string }>>(),
    },
};

// Restaurant API
export const restaurantApi = {
    // Tables
    tables: {
        list: (params?: { branchId?: string; status?: string }) =>
            api.get('restaurant/tables', { searchParams: params }).json<ApiResponse<Table[]>>(),
        get: (id: string) => api.get(`restaurant/tables/${id}`).json<ApiResponse<Table>>(),
        create: (data: Partial<Table>) => api.post('restaurant/tables', { json: data }).json<ApiResponse<Table>>(),
        update: (id: string, data: Partial<Table>) => api.put(`restaurant/tables/${id}`, { json: data }).json<ApiResponse<Table>>(),
        updateStatus: (id: string, status: string) => api.patch(`restaurant/tables/${id}/status`, { json: { status } }).json<ApiResponse<Table>>(),
        delete: (id: string) => api.delete(`restaurant/tables/${id}`).json<ApiResponse<{ message: string }>>(),
    },
    // Orders
    orders: {
        list: (params?: { branchId?: string; status?: string; tableId?: string }) =>
            api.get('restaurant/orders', { searchParams: params }).json<ApiResponse<Order[]>>(),
        get: (id: string) => api.get(`restaurant/orders/${id}`).json<ApiResponse<Order>>(),
        create: (data: Partial<Order>) => api.post('restaurant/orders', { json: data }).json<ApiResponse<Order>>(),
        update: (id: string, data: Partial<Order>) => api.put(`restaurant/orders/${id}`, { json: data }).json<ApiResponse<Order>>(),
        updateStatus: (id: string, status: string) => api.patch(`restaurant/orders/${id}/status`, { json: { status } }).json<ApiResponse<Order>>(),
        addItems: (id: string, items: unknown[]) => api.post(`restaurant/orders/${id}/items`, { json: { items } }).json<ApiResponse<Order>>(),
    },
    // Kitchen
    kitchen: {
        orders: (branchId?: string) => api.get('restaurant/kitchen', { searchParams: branchId ? { branchId } : {} }).json<ApiResponse<Order[]>>(),
        updateItemStatus: (itemId: string, status: string) => api.patch(`restaurant/kitchen/items/${itemId}/status`, { json: { status } }).json<ApiResponse<unknown>>(),
    },
    // Reservations
    reservations: {
        list: (params?: { date?: string; status?: string; page?: number }) =>
            api.get('restaurant/reservations', { searchParams: params }).json<ApiResponse<Reservation[]>>(),
        get: (id: string) => api.get(`restaurant/reservations/${id}`).json<ApiResponse<Reservation>>(),
        create: (data: Partial<Reservation>) => api.post('restaurant/reservations', { json: data }).json<ApiResponse<Reservation>>(),
        update: (id: string, data: Partial<Reservation>) => api.put(`restaurant/reservations/${id}`, { json: data }).json<ApiResponse<Reservation>>(),
        updateStatus: (id: string, status: string) => api.patch(`restaurant/reservations/${id}/status`, { json: { status } }).json<ApiResponse<Reservation>>(),
        delete: (id: string) => api.delete(`restaurant/reservations/${id}`).json<ApiResponse<{ message: string }>>(),
    },
};

// Reports API
export const reportsApi = {
    dashboard: () => api.get('reports/dashboard').json<ApiResponse<unknown>>(),
    sales: (params?: { startDate?: string; endDate?: string; branchId?: string }) =>
        api.get('reports/sales', { searchParams: params }).json<ApiResponse<unknown>>(),
    products: (params?: { startDate?: string; endDate?: string; limit?: number }) =>
        api.get('reports/products', { searchParams: params }).json<ApiResponse<unknown>>(),
    inventory: (params?: { branchId?: string }) =>
        api.get('reports/inventory', { searchParams: params }).json<ApiResponse<unknown>>(),
    payments: (params?: { startDate?: string; endDate?: string }) =>
        api.get('reports/payments', { searchParams: params }).json<ApiResponse<unknown>>(),
    customers: (params?: { startDate?: string; endDate?: string }) =>
        api.get('reports/customers', { searchParams: params }).json<ApiResponse<unknown>>(),
};

// Payments API
export const paymentsApi = {
    methods: {
        list: () => api.get('payments/methods').json<ApiResponse<PaymentMethod[]>>(),
        get: (id: string) => api.get(`payments/methods/${id}`).json<ApiResponse<PaymentMethod>>(),
        create: (data: Partial<PaymentMethod>) => api.post('payments/methods', { json: data }).json<ApiResponse<PaymentMethod>>(),
        update: (id: string, data: Partial<PaymentMethod>) => api.put(`payments/methods/${id}`, { json: data }).json<ApiResponse<PaymentMethod>>(),
        toggle: (id: string) => api.patch(`payments/methods/${id}/toggle`).json<ApiResponse<PaymentMethod>>(),
        delete: (id: string) => api.delete(`payments/methods/${id}`).json<ApiResponse<{ message: string }>>(),
    },
    transactions: {
        list: (params?: { page?: number; limit?: number; startDate?: string; endDate?: string }) =>
            api.get('payments/transactions', { searchParams: params }).json<ApiResponse<unknown[]>>(),
        get: (id: string) => api.get(`payments/transactions/${id}`).json<ApiResponse<unknown>>(),
    },
    summary: (params?: { startDate?: string; endDate?: string }) =>
        api.get('payments/summary', { searchParams: params }).json<ApiResponse<unknown>>(),
};

// Documents API
export const documentsApi = {
    list: (params?: { type?: string; status?: string; page?: number }) =>
        api.get('settings/documents', { searchParams: params }).json<ApiResponse<Document[]>>(),
    get: (id: string) => api.get(`settings/documents/${id}`).json<ApiResponse<Document>>(),
    create: (data: Partial<Document>) => api.post('settings/documents', { json: data }).json<ApiResponse<Document>>(),
    updateStatus: (id: string, status: string) => api.patch(`settings/documents/${id}/status`, { json: { status } }).json<ApiResponse<Document>>(),
    templates: {
        list: () => api.get('settings/document-templates').json<ApiResponse<DocumentTemplate[]>>(),
        get: (type: string) => api.get(`settings/document-templates/${type}`).json<ApiResponse<DocumentTemplate>>(),
        update: (type: string, data: Partial<DocumentTemplate>) => api.put(`settings/document-templates/${type}`, { json: data }).json<ApiResponse<DocumentTemplate>>(),
    },
};

// Types
export interface Product {
    id: string;
    name: string;
    sku: string;
    barcode?: string;
    categoryId: string;
    category?: Category;
    salePrice: number;
    price: number; // Alias for salePrice (frontend convenience)
    costPrice: number;
    unit: string;
    images?: string[];
    image?: string; // First image for display
    stock: number; // Computed from inventory
    isActive: boolean;
    inventory?: { quantity: number };
}

export interface Category {
    id: string;
    name: string;
    color?: string;
    icon?: string;
    sortOrder: number;
    isActive: boolean;
}

export interface Customer {
    id: string;
    name: string;
    phone?: string;
    email?: string;
    memberCode?: string;
    points: number;
    totalSpent: number;
}

export interface SaleInput {
    items: Array<{
        productId: string;
        quantity: number;
        price: number;
        discount?: number;
    }>;
    customerId?: string;
    paymentMethod: 'CASH' | 'CARD' | 'QRCODE' | 'TRANSFER';
    discountType?: 'PERCENTAGE' | 'FIXED';
    discountValue?: number;
    notes?: string;
}

export interface Sale {
    id: string;
    receiptNumber: string;
    items: Array<{
        id: string;
        productId: string;
        product: Product;
        quantity: number;
        unitPrice: number;
        discount: number;
        total: number;
    }>;
    subtotal: number;
    discountAmount: number;
    taxAmount: number;
    totalAmount: number;
    paymentMethod: string;
    status: 'COMPLETED' | 'VOIDED' | 'PENDING';
    customer?: Customer;
    createdAt: string;
}

export interface Branch {
    id: string;
    name: string;
    address?: string;
    phone?: string;
    isActive: boolean;
    isMainBranch: boolean;
    createdAt: string;
}

export interface Staff {
    id: string;
    name: string;
    email: string;
    phone?: string;
    roleId: string;
    role?: Role;
    branchId: string;
    branch?: Branch;
    isActive: boolean;
    createdAt: string;
}

export interface Role {
    id: string;
    name: string;
    permissions: string[];
    isSystem: boolean;
    createdAt: string;
}

export interface Vendor {
    id: string;
    name: string;
    code: string;
    email?: string;
    phone?: string;
    address?: string;
    contactPerson?: string;
    isActive: boolean;
    createdAt: string;
}

export interface PurchaseOrder {
    id: string;
    orderNumber: string;
    vendorId: string;
    vendor?: Vendor;
    branchId: string;
    items: Array<{
        productId: string;
        product?: Product;
        quantity: number;
        unitCost: number;
        total: number;
    }>;
    totalAmount: number;
    status: 'DRAFT' | 'PENDING' | 'APPROVED' | 'RECEIVED' | 'CANCELLED';
    expectedDate?: string;
    receivedDate?: string;
    notes?: string;
    createdAt: string;
}

export interface Shift {
    id: string;
    userId: string;
    branchId: string;
    registerId?: string;
    openingBalance: number;
    closingBalance?: number;
    status: 'OPEN' | 'CLOSED';
    openedAt: string;
    closedAt?: string;
    cashMovements?: Array<{
        type: 'IN' | 'OUT';
        amount: number;
        reason?: string;
        createdAt: string;
    }>;
    salesCount?: number;
    totalSales?: number;
}

export interface CashRegister {
    id: string;
    name: string;
    branchId: string;
    branch?: Branch;
    currentBalance: number;
    isActive: boolean;
    createdAt: string;
}

export interface HeldSale {
    id: string;
    name: string;
    items: Array<{
        productId: string;
        product?: Product;
        quantity: number;
        price: number;
    }>;
    customerId?: string;
    customer?: Customer;
    notes?: string;
    createdAt: string;
}

export interface Promotion {
    id: string;
    name: string;
    description?: string;
    type: 'PERCENTAGE' | 'FIXED' | 'BUY_X_GET_Y' | 'BUNDLE';
    value: number;
    minPurchase?: number;
    maxDiscount?: number;
    productIds?: string[];
    categoryIds?: string[];
    startDate: string;
    endDate: string;
    isActive: boolean;
    createdAt: string;
}

export interface Coupon {
    id: string;
    code: string;
    promotionId?: string;
    promotion?: Promotion;
    discountType: 'PERCENTAGE' | 'FIXED';
    discountValue: number;
    minPurchase?: number;
    maxDiscount?: number;
    usageLimit?: number;
    usedCount: number;
    startDate: string;
    endDate: string;
    isActive: boolean;
    createdAt: string;
}

export interface Table {
    id: string;
    name: string;
    branchId: string;
    capacity: number;
    zone?: string;
    status: 'AVAILABLE' | 'OCCUPIED' | 'RESERVED' | 'CLEANING';
    currentOrderId?: string;
    isActive: boolean;
}

export interface Order {
    id: string;
    orderNumber: string;
    tableId?: string;
    table?: Table;
    type: 'DINE_IN' | 'TAKEAWAY' | 'DELIVERY';
    items: Array<{
        id: string;
        productId: string;
        product?: Product;
        quantity: number;
        price: number;
        notes?: string;
        status: 'PENDING' | 'PREPARING' | 'READY' | 'SERVED';
    }>;
    status: 'OPEN' | 'PREPARING' | 'READY' | 'COMPLETED' | 'CANCELLED';
    subtotal: number;
    totalAmount: number;
    customerId?: string;
    customer?: Customer;
    notes?: string;
    createdAt: string;
}

export interface Reservation {
    id: string;
    customerName: string;
    phone: string;
    email?: string;
    tableId?: string;
    table?: Table;
    partySize: number;
    date: string;
    time: string;
    duration?: number;
    status: 'PENDING' | 'CONFIRMED' | 'SEATED' | 'COMPLETED' | 'CANCELLED' | 'NO_SHOW';
    notes?: string;
    createdAt: string;
}

export interface PaymentMethod {
    id: string;
    name: string;
    code: string;
    type: 'CASH' | 'CARD' | 'QRCODE' | 'TRANSFER' | 'WALLET';
    isActive: boolean;
    settings?: Record<string, unknown>;
    createdAt: string;
}

export interface Document {
    id: string;
    type: string;
    number: string;
    title?: string;
    data: Record<string, unknown>;
    status: 'DRAFT' | 'ISSUED' | 'CANCELLED';
    createdAt: string;
}

export interface DocumentTemplate {
    id: string;
    type: string;
    name: string;
    template: string;
    settings?: Record<string, unknown>;
    isActive: boolean;
}
