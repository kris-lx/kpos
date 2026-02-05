// ═══════════════════════════════════════════════════════════════════════════
// KPOS - Type Definitions
// ═══════════════════════════════════════════════════════════════════════════

// Re-export API types
export type {
    Product,
    Category,
    Customer,
    Sale,
    SaleInput,
    ApiResponse,
} from '$api';

// UI Types
export interface MenuItem {
    id: string;
    label: string;
    icon?: string;
    href?: string;
    action?: () => void;
    children?: MenuItem[];
    badge?: string | number;
    disabled?: boolean;
}

export interface Toast {
    id: string;
    type: 'success' | 'error' | 'warning' | 'info';
    title: string;
    message?: string;
    duration?: number;
}

export interface ModalProps {
    open: boolean;
    title?: string;
    size?: 'sm' | 'md' | 'lg' | 'xl' | 'full';
    closable?: boolean;
    onClose?: () => void;
}

export interface TableColumn<T> {
    key: keyof T | string;
    label: string;
    sortable?: boolean;
    width?: string;
    align?: 'left' | 'center' | 'right';
    render?: (value: unknown, row: T) => string;
}

export interface PaginationProps {
    page: number;
    limit: number;
    total: number;
    onPageChange: (page: number) => void;
}

// Form Types
export interface FormField {
    name: string;
    label: string;
    type: 'text' | 'number' | 'email' | 'password' | 'select' | 'textarea' | 'checkbox' | 'date';
    placeholder?: string;
    required?: boolean;
    disabled?: boolean;
    options?: { value: string; label: string }[];
    validation?: (value: unknown) => string | null;
}

// Payment Types
export type PaymentMethod = 'CASH' | 'CARD' | 'QRCODE' | 'TRANSFER';

export interface PaymentInfo {
    method: PaymentMethod;
    amount: number;
    reference?: string;
    change?: number;
}

// Print Types
export interface ReceiptData {
    receiptNumber: string;
    date: Date;
    cashier: string;
    items: Array<{
        name: string;
        quantity: number;
        price: number;
        total: number;
    }>;
    subtotal: number;
    discount: number;
    tax: number;
    total: number;
    payment: PaymentInfo;
    customer?: {
        name: string;
        phone?: string;
        memberCode?: string;
    };
}

// Dashboard Types
export interface DashboardStats {
    todaySales: number;
    todayRevenue: number;
    todayTransactions: number;
    averageTicket: number;
    topProducts: Array<{
        id: string;
        name: string;
        quantity: number;
        revenue: number;
    }>;
    hourlyRevenue: Array<{
        hour: number;
        revenue: number;
        transactions: number;
    }>;
}

// Settings Types
export interface BranchSettings {
    name: string;
    address: string;
    phone: string;
    taxId: string;
    logo?: string;
    receiptHeader?: string;
    receiptFooter?: string;
}

export interface PrinterSettings {
    type: 'thermal' | 'regular';
    paperWidth: 58 | 80;
    autoOpen: boolean;
    printCopy: number;
}

export interface POSSettings {
    taxRate: number;
    allowNegativeStock: boolean;
    requireCustomer: boolean;
    defaultPaymentMethod: PaymentMethod;
    showCategoryImages: boolean;
    productGridSize: 'small' | 'medium' | 'large';
}
