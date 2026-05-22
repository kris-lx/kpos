// @ts-nocheck
// ═══════════════════════════════════════════════════════════════════════════
// KPOS - Demo Data Seed Script (Standalone)
// Fully self-contained — no need to run seed.ts first.
// Creates: tenant, branch, store, roles, rules, role-rules, super admin,
//          payment methods, system enums, menu, and all demo data.
//
// Run: bun run db:seed:demo
// Safe to re-run — uses skip-if-exists checks throughout.
// ═══════════════════════════════════════════════════════════════════════════

import 'dotenv/config';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { eq, and, sql } from 'drizzle-orm';
import argon2 from 'argon2';
import * as schema from './schema';
import {
    tenants, branches, stores, users, userStores, roles, rules, roleRules,
    categories, products, inventory,
    vendors,
    customers, pointsHistory, membershipTiers, pointSettings,
    promotions, coupons, discounts,
    transactions, transactionItems, transactionPayments,
    paymentMethods, cashRegisters, shifts,
    menuPermissions, settings, systemEnums,
} from './schema/tables';

// ─── Config ──────────────────────────────────────────────────────────────

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) { console.error('❌ DATABASE_URL required'); process.exit(1); }

const client = postgres(DATABASE_URL, { max: 1 });
const db = drizzle(client, { schema });

const SUPER_ADMIN_EMAIL = process.env.SEED_ADMIN_EMAIL || 'admin@kpos.la';
const SUPER_ADMIN_PASSWORD = process.env.SEED_ADMIN_PASSWORD || 'Admin@123456';
const SUPER_ADMIN_NAME = process.env.SEED_ADMIN_NAME || 'Super Admin';
const DEMO_PASSWORD = 'Demo@123456';

// ─── Default Roles ───────────────────────────────────────────────────────

const DEFAULT_ROLES = [
    { name: 'super_admin', displayName: 'Super Admin', description: 'Full system access', permissions: ['*'], isSystem: true },
    { name: 'admin', displayName: 'Admin', description: 'System administrator', permissions: ['dashboard:view', 'sales:view', 'sales:create', 'sales:update', 'sales:delete', 'products:view', 'products:create', 'products:update', 'products:delete', 'categories:view', 'categories:create', 'categories:update', 'categories:delete', 'inventory:view', 'inventory:create', 'inventory:update', 'inventory:delete', 'inventory:transfer', 'inventory:adjust', 'promotions:view', 'promotions:create', 'promotions:update', 'promotions:delete', 'customers:view', 'customers:create', 'customers:update', 'customers:delete', 'payments:view', 'payments:create', 'payments:manage', 'documents:view', 'documents:create', 'documents:update', 'reports:view', 'reports:sales', 'reports:inventory', 'reports:financial', 'staff:view', 'staff:create', 'staff:update', 'staff:delete', 'roles:view', 'roles:create', 'roles:update', 'roles:delete', 'branches:view', 'branches:create', 'branches:update', 'stores:view', 'stores:create', 'stores:update', 'settings:view', 'settings:update', 'restaurant:view', 'restaurant:manage'], isSystem: true },
    { name: 'hq_admin', displayName: 'HQ Admin', description: 'Cross-branch admin, full access minus admin panel', permissions: ['dashboard:view', 'sales:view', 'sales:create', 'sales:update', 'products:view', 'products:create', 'products:update', 'products:delete', 'categories:view', 'categories:create', 'categories:update', 'inventory:view', 'inventory:create', 'inventory:update', 'inventory:delete', 'inventory:transfer', 'inventory:adjust', 'promotions:view', 'promotions:create', 'promotions:update', 'customers:view', 'customers:create', 'customers:update', 'customers:delete', 'payments:view', 'payments:create', 'payments:manage', 'documents:view', 'documents:create', 'documents:update', 'reports:view', 'reports:sales', 'reports:inventory', 'reports:financial', 'staff:view', 'staff:create', 'staff:update', 'roles:view', 'branches:view', 'branches:create', 'branches:update', 'branches:delete', 'stores:view', 'stores:create', 'stores:update', 'settings:view', 'settings:update', 'restaurant:view', 'restaurant:manage'], isSystem: true },
    { name: 'hq_manager', displayName: 'HQ Manager', description: 'Read-heavy HQ oversight, limited writes', permissions: ['dashboard:view', 'sales:view', 'products:view', 'categories:view', 'inventory:view', 'inventory:create', 'inventory:update', 'customers:view', 'payments:view', 'documents:view', 'reports:view', 'reports:sales', 'reports:inventory', 'reports:financial', 'staff:view', 'branches:view', 'stores:view', 'settings:view', 'restaurant:view'], isSystem: true },
    { name: 'store_owner', displayName: 'Store Owner', description: 'Store owner with full store access', permissions: ['dashboard:view', 'sales:view', 'sales:create', 'sales:update', 'sales:delete', 'products:view', 'products:create', 'products:update', 'products:delete', 'categories:view', 'categories:create', 'categories:update', 'inventory:view', 'inventory:create', 'inventory:update', 'inventory:transfer', 'promotions:view', 'promotions:create', 'promotions:update', 'customers:view', 'customers:create', 'customers:update', 'payments:view', 'payments:create', 'payments:manage', 'documents:view', 'documents:create', 'reports:view', 'reports:sales', 'reports:inventory', 'staff:view', 'staff:create', 'staff:update', 'staff:delete', 'roles:view', 'branches:view', 'branches:create', 'branches:update', 'branches:delete', 'stores:view', 'stores:create', 'stores:update', 'settings:view', 'settings:update', 'restaurant:view', 'restaurant:manage'], isSystem: true },
    { name: 'branch_admin', displayName: 'Branch Admin', description: 'Branch administrator', permissions: ['dashboard:view', 'sales:view', 'sales:create', 'sales:update', 'products:view', 'products:create', 'products:update', 'categories:view', 'categories:create', 'inventory:view', 'inventory:create', 'inventory:update', 'inventory:transfer', 'customers:view', 'customers:create', 'customers:update', 'payments:view', 'payments:create', 'documents:view', 'documents:create', 'reports:view', 'staff:view', 'staff:create', 'staff:update', 'stores:view', 'stores:update', 'settings:view', 'settings:update', 'restaurant:view', 'restaurant:manage'], isSystem: true },
    { name: 'branch_manager', displayName: 'Branch Manager', description: 'Day-to-day branch management, no settings', permissions: ['dashboard:view', 'sales:view', 'sales:create', 'sales:update', 'products:view', 'products:create', 'products:update', 'categories:view', 'inventory:view', 'inventory:create', 'inventory:update', 'customers:view', 'customers:create', 'customers:update', 'payments:view', 'payments:create', 'documents:view', 'documents:create', 'reports:view', 'staff:view', 'restaurant:view', 'restaurant:manage', 'promotions:view'], isSystem: true },
    { name: 'store_manager', displayName: 'Store Manager', description: 'Single store manager', permissions: ['dashboard:view', 'sales:view', 'sales:create', 'sales:update', 'products:view', 'products:create', 'products:update', 'categories:view', 'inventory:view', 'inventory:create', 'inventory:update', 'customers:view', 'customers:create', 'customers:update', 'payments:view', 'payments:create', 'documents:view', 'documents:create', 'reports:view', 'staff:view', 'staff:create', 'settings:view', 'restaurant:view', 'restaurant:manage', 'promotions:view'], isSystem: true },
    { name: 'cashier', displayName: 'Cashier', description: 'POS cashier', permissions: ['dashboard:view', 'sales:view', 'sales:create', 'products:view', 'customers:view', 'payments:view', 'payments:create', 'documents:view'], isSystem: true },
    { name: 'inventory_staff', displayName: 'Inventory Staff', description: 'Warehouse staff', permissions: ['dashboard:view', 'products:view', 'categories:view', 'inventory:view', 'inventory:create', 'inventory:update', 'inventory:adjust', 'inventory:transfer', 'reports:view', 'reports:inventory'], isSystem: true },
    { name: 'kitchen_staff', displayName: 'Kitchen Staff', description: 'Kitchen display system', permissions: ['restaurant:view', 'restaurant:manage'], isSystem: true },
    { name: 'waiter', displayName: 'Waiter', description: 'Restaurant waiter', permissions: ['restaurant:view', 'tables:create', 'tables:update'], isSystem: true },
];

// ─── Default Rules ───────────────────────────────────────────────────────

const DEFAULT_RULES = [
    { name: 'dashboard', displayName: 'Dashboard', module: 'dashboard', icon: 'LayoutDashboard', routes: ['/dashboard'], permissions: ['dashboard:view'], order: 0, isSystem: true },
    { name: 'sales', displayName: 'Sales (POS)', module: 'sales', icon: 'ShoppingCart', routes: ['/pos', '/pos/credit', '/pos/held'], permissions: ['sales:view', 'sales:create', 'sales:update', 'sales:delete', 'sales:void', 'sales:refund', 'pos:access', 'pos:discount', 'pos:void', 'pos:credit'], order: 1, isSystem: true },
    { name: 'products', displayName: 'Products', module: 'products', icon: 'Package', routes: ['/products', '/products/sku', '/products/pricing', '/categories', '/barcode'], permissions: ['products:view', 'products:create', 'products:update', 'products:delete', 'categories:view', 'categories:create', 'categories:update', 'categories:delete'], order: 2, isSystem: true },
    { name: 'inventory', displayName: 'Inventory', module: 'inventory', icon: 'Boxes', routes: ['/inventory', '/inventory/stockin', '/inventory/stockout', '/inventory/adjust', '/inventory/transfer', '/inventory/count', '/inventory/purchase-orders', '/inventory/vendors'], permissions: ['inventory:view', 'inventory:create', 'inventory:update', 'inventory:delete', 'inventory:transfer', 'inventory:adjust'], order: 3, isSystem: true },
    { name: 'restaurant', displayName: 'Restaurant', module: 'restaurant', icon: 'UtensilsCrossed', routes: ['/restaurant/tables', '/restaurant/orders', '/restaurant/kitchen', '/restaurant/reservations', '/restaurant/e-menu'], permissions: ['restaurant:view', 'restaurant:manage', 'tables:create', 'tables:update', 'tables:delete'], order: 4, isSystem: true },
    { name: 'promotions', displayName: 'Promotions', module: 'promotions', icon: 'Gift', routes: ['/promotions', '/promotions/coupons', '/promotions/discounts'], permissions: ['promotions:view', 'promotions:create', 'promotions:update', 'promotions:delete'], order: 5, isSystem: true },
    { name: 'customers', displayName: 'Customers (CRM)', module: 'customers', icon: 'Users', routes: ['/customers', '/customers/members', '/customers/points', '/customers/loyalty'], permissions: ['customers:view', 'customers:create', 'customers:update', 'customers:delete'], order: 6, isSystem: true },
    { name: 'payments', displayName: 'Payments', module: 'payments', icon: 'Wallet', routes: ['/payments', '/payments/transactions', '/payments/settlements'], permissions: ['payments:view', 'payments:create', 'payments:void', 'payments:settle', 'payments:manage'], order: 7, isSystem: true },
    { name: 'documents', displayName: 'Documents', module: 'documents', icon: 'FileText', routes: ['/documents', '/documents/design', '/documents/invoices', '/documents/tax-invoices'], permissions: ['documents:view', 'documents:create', 'documents:update', 'documents:delete'], order: 8, isSystem: true },
    { name: 'reports', displayName: 'Reports', module: 'reports', icon: 'BarChart3', routes: ['/reports', '/reports/products', '/reports/inventory', '/reports/financial', '/reports/staff', '/reports/customers'], permissions: ['reports:view', 'reports:sales', 'reports:inventory', 'reports:financial', 'reports:staff'], order: 9, isSystem: true },
    { name: 'branches', displayName: 'Branch Management', module: 'branches', icon: 'Building2', routes: ['/branches'], permissions: ['branches:view', 'branches:create', 'branches:update', 'branches:delete'], order: 10, isSystem: true },
    { name: 'management.stores', displayName: 'Store Management', module: 'management.stores', icon: 'Store', routes: ['/management/stores'], permissions: ['stores:view', 'stores:create', 'stores:update', 'stores:delete'], order: 11, isSystem: true },
    { name: 'management.staff', displayName: 'Staff Management', module: 'management.staff', icon: 'UserCog', routes: ['/staff', '/staff/shifts'], permissions: ['staff:view', 'staff:create', 'staff:update', 'staff:delete'], order: 12, isSystem: true },
    { name: 'management.roles', displayName: 'Role Management', module: 'management.roles', icon: 'Shield', routes: ['/staff/roles'], permissions: ['roles:view', 'roles:create', 'roles:update', 'roles:delete'], order: 13, isSystem: true },
    { name: 'settings', displayName: 'Settings', module: 'settings', icon: 'Settings', routes: ['/settings', '/settings/display', '/settings/receipt', '/settings/tax', '/settings/payments', '/settings/printers', '/settings/notifications', '/settings/integrations', '/settings/profile'], permissions: ['settings:view', 'settings:update'], order: 14, isSystem: true },
    { name: 'admin', displayName: 'Super Admin', module: 'admin', icon: 'ShieldCheck', routes: ['/admin', '/admin/stores', '/admin/requests', '/admin/branches', '/admin/users', '/admin/roles', '/admin/positions', '/admin/rules', '/admin/audit', '/admin/permissions', '/admin/enums'], permissions: ['*', 'admin:access', 'admin:view', 'admin:manage'], order: 15, isSystem: true },
];

// ─── Default Role→Rule CRUD Mapping ──────────────────────────────────────

const DEFAULT_ROLE_RULES: Record<string, Record<string, { r: boolean; c: boolean; u: boolean; d: boolean }>> = {
    super_admin: Object.fromEntries(DEFAULT_RULES.map(r => [r.name, { r: true, c: true, u: true, d: true }])),
    admin: Object.fromEntries(DEFAULT_RULES.filter(r => r.name !== 'admin' && r.name !== 'sales').map(r => [r.name, { r: true, c: true, u: true, d: true }])),
    hq_admin: Object.fromEntries(DEFAULT_RULES.filter(r => r.name !== 'admin').map(r => [r.name, { r: true, c: true, u: true, d: true }])),
    hq_manager: {
        dashboard: { r: true, c: false, u: false, d: false },
        sales: { r: true, c: false, u: false, d: false },
        products: { r: true, c: false, u: false, d: false },
        inventory: { r: true, c: true, u: true, d: false },
        restaurant: { r: true, c: false, u: false, d: false },
        promotions: { r: true, c: false, u: false, d: false },
        customers: { r: true, c: false, u: false, d: false },
        payments: { r: true, c: false, u: false, d: false },
        documents: { r: true, c: false, u: false, d: false },
        reports: { r: true, c: false, u: false, d: false },
        branches: { r: true, c: false, u: false, d: false },
        'management.stores': { r: true, c: false, u: false, d: false },
        'management.staff': { r: true, c: false, u: false, d: false },
        settings: { r: true, c: false, u: false, d: false },
    },
    store_owner: {
        dashboard: { r: true, c: false, u: false, d: false }, sales: { r: true, c: true, u: true, d: true },
        products: { r: true, c: true, u: true, d: true }, inventory: { r: true, c: true, u: true, d: false },
        restaurant: { r: true, c: true, u: true, d: false }, promotions: { r: true, c: true, u: true, d: true },
        customers: { r: true, c: true, u: true, d: false }, payments: { r: true, c: true, u: false, d: false },
        documents: { r: true, c: true, u: false, d: false }, reports: { r: true, c: false, u: false, d: false },
        branches: { r: true, c: false, u: true, d: false },
        'management.stores': { r: true, c: true, u: true, d: true }, 'management.staff': { r: true, c: true, u: true, d: true },
        'management.roles': { r: true, c: false, u: false, d: false }, settings: { r: true, c: false, u: true, d: false },
    },
    branch_admin: {
        dashboard: { r: true, c: false, u: false, d: false },
        sales: { r: true, c: true, u: true, d: false },
        products: { r: true, c: true, u: true, d: false },
        inventory: { r: true, c: true, u: true, d: false },
        restaurant: { r: true, c: true, u: true, d: false },
        promotions: { r: true, c: true, u: true, d: false },
        customers: { r: true, c: true, u: true, d: false },
        payments: { r: true, c: true, u: false, d: false },
        documents: { r: true, c: true, u: false, d: false },
        reports: { r: true, c: false, u: false, d: false },
        branches: { r: true, c: false, u: true, d: false },
        'management.stores': { r: true, c: false, u: true, d: false },
        'management.staff': { r: true, c: true, u: true, d: false },
        settings: { r: true, c: false, u: true, d: false },
    },
    branch_manager: {
        dashboard: { r: true, c: false, u: false, d: false },
        sales: { r: true, c: true, u: true, d: false },
        products: { r: true, c: true, u: true, d: false },
        inventory: { r: true, c: true, u: true, d: false },
        restaurant: { r: true, c: true, u: true, d: false },
        promotions: { r: true, c: false, u: false, d: false },
        customers: { r: true, c: true, u: true, d: false },
        payments: { r: true, c: true, u: false, d: false },
        documents: { r: true, c: true, u: false, d: false },
        reports: { r: true, c: false, u: false, d: false },
        'management.staff': { r: true, c: false, u: false, d: false },
    },
    store_manager: {
        dashboard: { r: true, c: false, u: false, d: false },
        sales: { r: true, c: true, u: true, d: false },
        products: { r: true, c: true, u: true, d: false },
        inventory: { r: true, c: true, u: true, d: false },
        restaurant: { r: true, c: true, u: true, d: false },
        promotions: { r: true, c: false, u: false, d: false },
        customers: { r: true, c: true, u: true, d: false },
        payments: { r: true, c: true, u: false, d: false },
        documents: { r: true, c: true, u: false, d: false },
        reports: { r: true, c: false, u: false, d: false },
        'management.staff': { r: true, c: true, u: false, d: false },
        settings: { r: true, c: false, u: false, d: false },
    },
    cashier: {
        dashboard: { r: true, c: false, u: false, d: false }, sales: { r: true, c: true, u: false, d: false },
        products: { r: true, c: false, u: false, d: false }, customers: { r: true, c: false, u: false, d: false },
        payments: { r: true, c: true, u: false, d: false }, documents: { r: true, c: false, u: false, d: false },
    },
    inventory_staff: {
        dashboard: { r: true, c: false, u: false, d: false }, products: { r: true, c: false, u: false, d: false },
        inventory: { r: true, c: true, u: true, d: false }, reports: { r: true, c: false, u: false, d: false },
    },
    kitchen_staff: { restaurant: { r: true, c: true, u: true, d: false } },
    waiter: { restaurant: { r: true, c: true, u: true, d: false }, sales: { r: true, c: true, u: false, d: false } },
};

// ─── Default Payment Methods ──────────────────────────────────────────────

const DEFAULT_PAYMENT_METHODS = [
    { name: 'Cash', code: 'CASH', type: 'cash', icon: 'Banknote', isDefault: true, sortOrder: 0 },
    { name: 'Card', code: 'CARD', type: 'card', icon: 'CreditCard', sortOrder: 1 },
    { name: 'QR / Bank Transfer', code: 'TRANSFER', type: 'transfer', icon: 'QrCode', sortOrder: 2 },
];

// ─── Default System Enums ────────────────────────────────────────────────

const DEFAULT_ENUMS = [
    { type: 'business_type', value: 'retail', label: 'Retail', labelLao: 'ຂາຍຍ່ອຍ', order: 0, isSystem: true },
    { type: 'business_type', value: 'restaurant', label: 'Restaurant', labelLao: 'ຮ້ານອາຫານ', order: 1, isSystem: true },
    { type: 'business_type', value: 'cafe', label: 'Café', labelLao: 'ຮ້ານກາເຟ', order: 2, isSystem: true },
    { type: 'business_type', value: 'wholesale', label: 'Wholesale', labelLao: 'ຂາຍສົ່ງ', order: 3, isSystem: true },
    { type: 'business_type', value: 'service', label: 'Service', labelLao: 'ບໍລິການ', order: 4, isSystem: true },
    { type: 'stockout_reason', value: 'damaged', label: 'Damaged', labelLao: 'ເສຍຫາຍ', order: 0, isSystem: true },
    { type: 'stockout_reason', value: 'expired', label: 'Expired', labelLao: 'ໝົດອາຍຸ', order: 1, isSystem: true },
    { type: 'stockout_reason', value: 'lost', label: 'Lost', labelLao: 'ສູນເສຍ', order: 2, isSystem: true },
    { type: 'stockout_reason', value: 'returned', label: 'Returned to Supplier', labelLao: 'ສົ່ງຄືນຜູ້ສະໜອງ', order: 3, isSystem: true },
    { type: 'stockin_reason', value: 'purchase', label: 'Purchase', labelLao: 'ຊື້ເຂົ້າ', order: 0, isSystem: true },
    { type: 'stockin_reason', value: 'transfer', label: 'Transfer In', labelLao: 'ໂອນເຂົ້າ', order: 1, isSystem: true },
    { type: 'stockin_reason', value: 'return', label: 'Customer Return', labelLao: 'ລູກຄ້າສົ່ງຄືນ', order: 2, isSystem: true },
    { type: 'stockin_reason', value: 'adjustment', label: 'Adjustment', labelLao: 'ປັບປຸງ', order: 3, isSystem: true },
];

// ─── Full Menu Structure ──────────────────────────────────────────────────

const MENU_STRUCTURE = [
    { key: 'dashboard', label: 'Dashboard', labelLao: 'ແຜງຄວບຄຸມ', icon: 'LayoutDashboard', path: '/dashboard', requiredPermission: 'dashboard:view', children: [] },
    { key: 'sales', label: 'Sales', labelLao: 'ຂາຍ', icon: 'ShoppingCart', requiredPermission: 'sales:create', children: [
        { key: 'sales.pos', label: 'POS', labelLao: 'ໜ້າຂາຍ POS', icon: 'ShoppingCart', path: '/pos', requiredPermission: 'sales:create' },
        { key: 'sales.credit', label: 'Credit Sales', labelLao: 'ຂາຍສິນເຊື່ອ', icon: 'CreditCard', path: '/pos/credit', requiredPermission: 'sales:create' },
        { key: 'sales.held', label: 'Held Orders', labelLao: 'ບິນທີ່ພັກໄວ້', icon: 'ClipboardList', path: '/pos/held', requiredPermission: 'sales:create' },
    ]},
    { key: 'products', label: 'Products', labelLao: 'ສິນຄ້າ', icon: 'Package', requiredPermission: 'products:view', children: [
        { key: 'products.list', label: 'Product List', labelLao: 'ລາຍການສິນຄ້າ', icon: 'Package', path: '/products', requiredPermission: 'products:view' },
        { key: 'products.categories', label: 'Categories', labelLao: 'ໝວດໝູ່', icon: 'Tags', path: '/categories', requiredPermission: 'categories:view' },
        { key: 'products.barcode', label: 'Barcode / QR', labelLao: 'Barcode / QR Code', icon: 'Barcode', path: '/barcode', requiredPermission: 'products:view' },
        { key: 'products.sku', label: 'SKU / Variants', labelLao: 'SKU / ຕົວເລືອກ', icon: 'Layers', path: '/products/sku', requiredPermission: 'products:view' },
        { key: 'products.pricing', label: 'Pricing Levels', labelLao: 'ລະດັບລາຄາ', icon: 'DollarSign', path: '/products/pricing', requiredPermission: 'products:update' },
    ]},
    { key: 'inventory', label: 'Inventory', labelLao: 'ສາງ', icon: 'Boxes', requiredPermission: 'inventory:view', children: [
        { key: 'inventory.stock', label: 'Stock', labelLao: 'ສາງສິນຄ້າ', icon: 'Boxes', path: '/inventory', requiredPermission: 'inventory:view' },
        { key: 'inventory.stockin', label: 'Stock In', labelLao: 'ນຳເຂົ້າສິນຄ້າ', icon: 'TrendingUp', path: '/inventory/stockin', requiredPermission: 'inventory:create' },
        { key: 'inventory.stockout', label: 'Stock Out', labelLao: 'ນຳອອກສິນຄ້າ', icon: 'TrendingDown', path: '/inventory/stockout', requiredPermission: 'inventory:create' },
        { key: 'inventory.adjust', label: 'Stock Adjust', labelLao: 'ປັບປ່ຽນສະຕ໋ອກ', icon: 'Scale', path: '/inventory/adjust', requiredPermission: 'inventory:update' },
        { key: 'inventory.transfer', label: 'Stock Transfer', labelLao: 'ໂອນຍ້າຍສິນຄ້າ', icon: 'ArrowRightLeft', path: '/inventory/transfer', requiredPermission: 'inventory:update' },
        { key: 'inventory.count', label: 'Stock Count', labelLao: 'ກວດນັບສະຕ໋ອກ', icon: 'ClipboardCheck', path: '/inventory/count', requiredPermission: 'inventory:update' },
        { key: 'inventory.purchase-orders', label: 'Purchase Orders', labelLao: 'ສັ່ງຊື້ (PO)', icon: 'ClipboardList', path: '/inventory/purchase-orders', requiredPermission: 'inventory:create' },
        { key: 'inventory.vendors', label: 'Vendors', labelLao: 'ຜູ້ສະໜອງ', icon: 'Truck', path: '/inventory/vendors', requiredPermission: 'inventory:view' },
        { key: 'inventory.expiry', label: 'Expiry Tracking', labelLao: 'ວັນໝົດອາຍຸ', icon: 'CalendarClock', path: '/inventory/expiry', requiredPermission: 'inventory:view' },
        { key: 'inventory.out-of-stock', label: 'Out of Stock', labelLao: 'ສິນຄ້າໝົດສະຕ໋ອກ', icon: 'PackageX', path: '/inventory/out-of-stock', requiredPermission: 'inventory:view' },
    ]},
    { key: 'restaurant', label: 'Restaurant', labelLao: 'ຮ້ານອາຫານ', icon: 'UtensilsCrossed', requiredPermission: 'restaurant:view', children: [
        { key: 'restaurant.tables', label: 'Tables', labelLao: 'ໂຕະ', icon: 'UtensilsCrossed', path: '/restaurant/tables', requiredPermission: 'restaurant:view' },
        { key: 'restaurant.orders', label: 'Orders', labelLao: 'ອໍເດີ', icon: 'ClipboardList', path: '/restaurant/orders', requiredPermission: 'restaurant:view' },
        { key: 'restaurant.kitchen', label: 'Kitchen (KDS)', labelLao: 'ຄົວ (KDS)', icon: 'ChefHat', path: '/restaurant/kitchen', requiredPermission: 'restaurant:manage' },
        { key: 'restaurant.reservations', label: 'Reservations', labelLao: 'ຈອງໂຕະ', icon: 'CalendarClock', path: '/restaurant/reservations', requiredPermission: 'restaurant:view' },
        { key: 'restaurant.emenu', label: 'e-Menu', labelLao: 'e-Menu', icon: 'QrCode', path: '/restaurant/e-menu', requiredPermission: 'restaurant:view' },
    ]},
    { key: 'promotions', label: 'Promotions', labelLao: 'ໂປຣໂມຊັ່ນ', icon: 'Gift', requiredPermission: 'promotions:view', children: [
        { key: 'promotions.list', label: 'Promotions', labelLao: 'ໂປຣໂມຊັ່ນ', icon: 'Gift', path: '/promotions', requiredPermission: 'promotions:view' },
        { key: 'promotions.coupons', label: 'Coupons', labelLao: 'ຄູປອງ', icon: 'TicketPercent', path: '/promotions/coupons', requiredPermission: 'promotions:view' },
        { key: 'promotions.discounts', label: 'Discounts', labelLao: 'ສ່ວນຫຼຸດ', icon: 'Percent', path: '/promotions/discounts', requiredPermission: 'promotions:view' },
    ]},
    { key: 'crm', label: 'CRM', labelLao: 'ລູກຄ້າ (CRM)', icon: 'Users', requiredPermission: 'customers:view', children: [
        { key: 'crm.customers', label: 'Customers', labelLao: 'ລູກຄ້າ', icon: 'Users', path: '/customers', requiredPermission: 'customers:view' },
        { key: 'crm.members', label: 'Members', labelLao: 'ສະມາຊິກ', icon: 'Crown', path: '/customers/members', requiredPermission: 'customers:view' },
        { key: 'crm.points', label: 'Points', labelLao: 'ຄະແນນສະສົມ', icon: 'Star', path: '/customers/points', requiredPermission: 'customers:view' },
        { key: 'crm.loyalty', label: 'Loyalty Program', labelLao: 'ໂປຣແກຣມ Loyalty', icon: 'Heart', path: '/customers/loyalty', requiredPermission: 'customers:update' },
    ]},
    { key: 'payments', label: 'Payments', labelLao: 'ການຊຳລະ', icon: 'Wallet', requiredPermission: 'payments:view', children: [
        { key: 'payments.methods', label: 'Payment Methods', labelLao: 'ວິທີຊຳລະ', icon: 'CreditCard', path: '/payments', requiredPermission: 'payments:view' },
        { key: 'payments.transactions', label: 'Transactions', labelLao: 'ລາຍການຊຳລະ', icon: 'Receipt', path: '/payments/transactions', requiredPermission: 'payments:view' },
        { key: 'payments.settlements', label: 'Settlements', labelLao: 'ປິດບັນຊີ', icon: 'DollarSign', path: '/payments/settlements', requiredPermission: 'payments:manage' },
    ]},
    { key: 'documents', label: 'Documents', labelLao: 'ເອກະສານ', icon: 'FileText', requiredPermission: 'documents:view', children: [
        { key: 'documents.receipts', label: 'Receipts', labelLao: 'ໃບບິນ', icon: 'Receipt', path: '/documents', requiredPermission: 'documents:view' },
        { key: 'documents.design', label: 'Receipt Design', labelLao: 'ອອກແບບໃບບິນ', icon: 'Printer', path: '/documents/design', requiredPermission: 'documents:update' },
        { key: 'documents.invoices', label: 'Invoices', labelLao: 'ໃບແຈ້ງໜີ້', icon: 'FileText', path: '/documents/invoices', requiredPermission: 'documents:view' },
        { key: 'documents.tax-invoices', label: 'Tax Invoices', labelLao: 'ໃບກຳກັບພາສີ', icon: 'FileSpreadsheet', path: '/documents/tax-invoices', requiredPermission: 'documents:view' },
    ]},
    { key: 'reports', label: 'Reports', labelLao: 'ລາຍງານ', icon: 'BarChart3', requiredPermission: 'reports:view', children: [
        { key: 'reports.sales', label: 'Sales Report', labelLao: 'ລາຍງານການຂາຍ', icon: 'BarChart3', path: '/reports', requiredPermission: 'reports:view' },
        { key: 'reports.products', label: 'Product Report', labelLao: 'ລາຍງານສິນຄ້າ', icon: 'Package', path: '/reports/products', requiredPermission: 'reports:view' },
        { key: 'reports.inventory', label: 'Inventory Report', labelLao: 'ລາຍງານສາງ', icon: 'Boxes', path: '/reports/inventory', requiredPermission: 'reports:view' },
        { key: 'reports.financial', label: 'Financial Report', labelLao: 'ລາຍງານການເງິນ', icon: 'DollarSign', path: '/reports/financial', requiredPermission: 'reports:view' },
        { key: 'reports.staff', label: 'Staff Report', labelLao: 'ລາຍງານພະນັກງານ', icon: 'UserCog', path: '/reports/staff', requiredPermission: 'reports:view' },
        { key: 'reports.customers', label: 'Customer Report', labelLao: 'ລາຍງານລູກຄ້າ', icon: 'Users', path: '/reports/customers', requiredPermission: 'reports:view' },
        { key: 'reports.gl', label: 'GL / Finance & Compliance', labelLao: 'GL / ການເງິນ & ກວດກາ', icon: 'BookOpen', path: '/reports/gl', requiredPermission: 'reports:financial' },
    ]},
    { key: 'management', label: 'Management', labelLao: 'ຈັດການ', icon: 'Building2', requiredPermission: 'staff:view', children: [
        { key: 'management.branches', label: 'Branches', labelLao: 'ສາຂາ', icon: 'Building2', path: '/branches', requiredPermission: 'branches:view' },
        { key: 'management.stores', label: 'Stores', labelLao: 'ຮ້ານຄ້າ', icon: 'Store', path: '/management/stores', requiredPermission: 'stores:view' },
        { key: 'management.staff', label: 'Staff', labelLao: 'ພະນັກງານ', icon: 'UserCog', path: '/staff', requiredPermission: 'staff:view' },
        { key: 'management.roles', label: 'Roles', labelLao: 'ບົດບາດ', icon: 'Users', path: '/staff/roles', requiredPermission: 'roles:view' },
        { key: 'management.cashregisters', label: 'Cash Registers', labelLao: 'ເຄື່ອງ POS', icon: 'Monitor', path: '/management/cashregisters', requiredPermission: 'settings:view' },
        { key: 'management.shifts', label: 'Shifts', labelLao: 'ກະການເຮັດວຽກ', icon: 'Timer', path: '/staff/shifts', requiredPermission: 'staff:view' },
    ]},
    { key: 'settings', label: 'Settings', labelLao: 'ຕັ້ງຄ່າ', icon: 'Settings', requiredPermission: 'settings:view', children: [
        { key: 'settings.general', label: 'General', labelLao: 'ຕັ້ງຄ່າທົ່ວໄປ', icon: 'Settings', path: '/settings', requiredPermission: 'settings:view' },
        { key: 'settings.display', label: 'Display', labelLao: 'ຕັ້ງຄ່າຈໍສະແດງ', icon: 'Monitor', path: '/settings/display', requiredPermission: 'settings:view' },
        { key: 'settings.receipt', label: 'Receipt', labelLao: 'ຕັ້ງຄ່າໃບບິນ', icon: 'Receipt', path: '/settings/receipt', requiredPermission: 'settings:update' },
        { key: 'settings.tax', label: 'Tax', labelLao: 'ຕັ້ງຄ່າພາສີ', icon: 'Percent', path: '/settings/tax', requiredPermission: 'settings:update' },
        { key: 'settings.payments', label: 'Payments', labelLao: 'ຕັ້ງຄ່າການຊຳລະ', icon: 'CreditCard', path: '/settings/payments', requiredPermission: 'settings:update' },
        { key: 'settings.printers', label: 'Printers', labelLao: 'ຕັ້ງຄ່າເຄື່ອງພິມ', icon: 'Printer', path: '/settings/printers', requiredPermission: 'settings:update' },
        { key: 'settings.notifications', label: 'Notifications', labelLao: 'ຕັ້ງຄ່າແຈ້ງເຕືອນ', icon: 'BellRing', path: '/settings/notifications', requiredPermission: 'settings:view' },
        { key: 'settings.integrations', label: 'Integrations', labelLao: 'ເຊື່ອມຕໍ່', icon: 'Plug', path: '/settings/integrations', requiredPermission: 'settings:update' },
    ]},
    { key: 'super-admin', label: 'Super Admin', labelLao: 'Super Admin', icon: 'ShieldCheck', requiredPermission: 'admin:view', children: [
        { key: 'super-admin.dashboard', label: 'Admin Dashboard', labelLao: 'ແຜງຄວບຄຸມ', icon: 'Shield', path: '/admin', requiredPermission: 'admin:view' },
        { key: 'super-admin.requests', label: 'Requests', labelLao: 'ຄຳຂໍເປີດຮ້ານ', icon: 'FileCheck', path: '/admin/requests', requiredPermission: 'admin:view' },
        { key: 'super-admin.stores', label: 'Stores Overview', labelLao: 'ພາບລວມຮ້ານ/ສາຂາ', icon: 'Store', path: '/admin/stores', requiredPermission: 'admin:view' },
        { key: 'super-admin.branches', label: 'Branches', labelLao: 'ຈັດການສາຂາ', icon: 'Building2', path: '/admin/branches', requiredPermission: 'admin:view' },
        { key: 'super-admin.users', label: 'Users', labelLao: 'ຈັດການຜູ້ໃຊ້', icon: 'Users', path: '/admin/users', requiredPermission: 'admin:view' },
        { key: 'super-admin.roles', label: 'Roles', labelLao: 'ຈັດການບົດບາດ', icon: 'Key', path: '/admin/roles', requiredPermission: 'admin:manage' },
        { key: 'super-admin.rules', label: 'Rules', labelLao: 'ຈັດການ Rules', icon: 'ShieldCheck', path: '/admin/rules', requiredPermission: 'admin:manage' },
        { key: 'super-admin.permissions', label: 'Permissions', labelLao: 'ຈັດການສິດ', icon: 'Shield', path: '/admin/permissions', requiredPermission: 'admin:manage' },
        { key: 'super-admin.audit', label: 'Audit Log', labelLao: 'ປະຫວັດການໃຊ້ງານ', icon: 'History', path: '/admin/audit', requiredPermission: 'admin:view' },
    ]},
    { key: 'help', label: 'Help', labelLao: 'ຊ່ວຍເຫຼືອ', icon: 'HelpCircle', path: '/help', requiredPermission: null, children: [] },
];

// ─── Helpers ─────────────────────────────────────────────────────────────

function daysAgo(n: number): Date {
    const d = new Date();
    d.setDate(d.getDate() - n);
    return d;
}

function randomInt(min: number, max: number): number {
    return Math.floor(Math.random() * (max - min + 1)) + min;
}

function pick<T>(arr: T[]): T {
    return arr[Math.floor(Math.random() * arr.length)];
}

// ─── Main Seed ────────────────────────────────────────────────────────────

async function seedDemo() {
    console.log('\n🌱 KPOS Demo Data Seed (Standalone)\n');

    // ── Step 0: Tenant ────────────────────────────────────────────────────
    console.log('0️⃣  Ensuring tenant...');
    let defaultTenant = await db.query.tenants.findFirst({ where: eq(tenants.code, 'DEFAULT') });
    if (!defaultTenant) {
        [defaultTenant] = await db.insert(tenants).values({
            name: 'Default Organization', code: 'DEFAULT', plan: 'free',
            isActive: true, status: 'active',
        }).returning();
        console.log(`   + Created tenant: ${defaultTenant.name} (${defaultTenant.code})`);
    } else {
        console.log(`   - Tenant exists: ${defaultTenant.name}`);
    }
    const tenantId = defaultTenant.id;

    // ── Step 1: HQ Branch ─────────────────────────────────────────────────
    console.log('1️⃣  Ensuring HQ branch...');
    let hqBranch = await db.query.branches.findFirst({ where: eq(branches.isMain, true) });
    if (!hqBranch) {
        [hqBranch] = await db.insert(branches).values({
            tenantId,
            name: 'Headquarters', code: 'HQ', isMain: true, isActive: true,
        }).returning();
        console.log(`   + Created HQ branch: ${hqBranch.name} (${hqBranch.code})`);
    } else {
        if (!hqBranch.tenantId) {
            await db.update(branches).set({ tenantId }).where(eq(branches.id, hqBranch.id));
            hqBranch = { ...hqBranch, tenantId };
        }
        console.log(`   - HQ branch exists: ${hqBranch.name}`);
    }
    const hqBranchId = hqBranch.id;
    const hqPath = hqBranch.branchPath || 'hq';

    // ── Step 2: HQ Store ──────────────────────────────────────────────────
    console.log('2️⃣  Ensuring HQ store...');
    let hqStore = await db.query.stores.findFirst({ where: eq(stores.branchId, hqBranchId) });
    if (!hqStore) {
        [hqStore] = await db.insert(stores).values({
            tenantId,
            name: 'Main Store', code: 'MAIN', branchId: hqBranchId,
            isActive: true, isDefault: true,
        }).returning();
        console.log(`   + Created HQ store: ${hqStore.name}`);
    } else {
        if (!hqStore.tenantId) {
            await db.update(stores).set({ tenantId }).where(eq(stores.id, hqStore.id));
            hqStore = { ...hqStore, tenantId };
        }
        console.log(`   - HQ store exists: ${hqStore.name}`);
    }
    const hqStoreId = hqStore.id;

    // ── Step 3: System Roles ──────────────────────────────────────────────
    console.log('3️⃣  Seeding system roles...');
    const roleMap: Record<string, string> = {};
    for (const roleDef of DEFAULT_ROLES) {
        let role = await db.query.roles.findFirst({ where: eq(roles.name, roleDef.name) });
        if (!role) {
            [role] = await db.insert(roles).values(roleDef).returning();
            console.log(`   + Role: ${roleDef.displayName}`);
        } else {
            await db.update(roles).set({
                displayName: roleDef.displayName,
                description: roleDef.description,
                permissions: roleDef.permissions,
            }).where(eq(roles.id, role.id));
        }
        roleMap[roleDef.name] = role.id;
    }
    console.log(`   ✅ ${DEFAULT_ROLES.length} roles ready`);

    // ── Step 4: System Rules ──────────────────────────────────────────────
    console.log('4️⃣  Seeding system rules...');
    const ruleMap: Record<string, string> = {};
    for (const ruleDef of DEFAULT_RULES) {
        let rule = await db.query.rules.findFirst({ where: eq(rules.name, ruleDef.name) });
        if (!rule) {
            [rule] = await db.insert(rules).values({
                ...ruleDef, isActive: true, description: null,
            }).returning();
            console.log(`   + Rule: ${ruleDef.displayName}`);
        } else {
            await db.update(rules).set({
                displayName: ruleDef.displayName,
                permissions: ruleDef.permissions,
                routes: ruleDef.routes,
                module: ruleDef.module,
                icon: ruleDef.icon,
                order: ruleDef.order,
            }).where(eq(rules.id, rule.id));
        }
        ruleMap[ruleDef.name] = rule.id;
    }
    console.log(`   ✅ ${DEFAULT_RULES.length} rules ready`);

    // ── Step 5: Role-Rule CRUD Mappings ───────────────────────────────────
    console.log('5️⃣  Seeding role-rule CRUD mappings...');
    let rrCount = 0;
    for (const [roleName, ruleEntries] of Object.entries(DEFAULT_ROLE_RULES)) {
        const roleId = roleMap[roleName];
        if (!roleId) continue;
        for (const [ruleName, crud] of Object.entries(ruleEntries)) {
            const ruleId = ruleMap[ruleName];
            if (!ruleId) continue;
            const existing = await db.query.roleRules.findFirst({
                where: (rr, { and: a, eq: e }) => a(e(rr.roleId, roleId), e(rr.ruleId, ruleId)),
            });
            if (!existing) {
                await db.insert(roleRules).values({
                    roleId, ruleId, canRead: crud.r, canCreate: crud.c, canUpdate: crud.u, canDelete: crud.d,
                });
                rrCount++;
            } else {
                await db.update(roleRules).set({
                    canRead: crud.r, canCreate: crud.c, canUpdate: crud.u, canDelete: crud.d,
                }).where(and(eq(roleRules.roleId, roleId), eq(roleRules.ruleId, ruleId)));
            }
        }
    }
    console.log(`   ✅ ${rrCount} role-rule mappings created`);

    // ── Step 6: Super Admin User ──────────────────────────────────────────
    console.log('6️⃣  Ensuring super admin user...');
    let adminUser = await db.query.users.findFirst({ where: eq(users.email, SUPER_ADMIN_EMAIL) });
    if (!adminUser) {
        const hashedAdmin = await argon2.hash(SUPER_ADMIN_PASSWORD);
        [adminUser] = await db.insert(users).values({
            tenantId,
            email: SUPER_ADMIN_EMAIL,
            password: hashedAdmin,
            name: SUPER_ADMIN_NAME,
            role: 'super_admin',
            roleId: roleMap.super_admin,
            branchId: hqBranchId,
            isSuperAdmin: true,
            isActive: true,
            emailVerified: true,
            permissions: ['*'],
        }).returning();

        await db.insert(userStores).values({
            tenantId,
            userId: adminUser.id,
            storeId: hqStoreId,
            branchId: hqBranchId,
            canRead: true, canWrite: true, canDelete: true, canManage: true, isDefault: true,
        });
        console.log(`   + Created super admin: ${SUPER_ADMIN_EMAIL}`);
    } else {
        if (!adminUser.tenantId) {
            await db.update(users).set({ tenantId }).where(eq(users.id, adminUser.id));
        }
        console.log(`   - Super admin exists: ${adminUser.email}`);
    }

    // ── Step 7: Payment Methods ───────────────────────────────────────────
    console.log('7️⃣  Seeding payment methods...');
    let pmCount = 0;
    for (const pm of DEFAULT_PAYMENT_METHODS) {
        const existing = await db.query.paymentMethods.findFirst({
            where: (t, { and: a, eq: e }) => a(e(t.code, pm.code), e(t.tenantId, tenantId)),
        });
        if (!existing) {
            await db.insert(paymentMethods).values({ ...pm, tenantId, isActive: true });
            pmCount++;
        }
    }
    console.log(`   ✅ ${pmCount} payment methods created`);

    // ── Step 8: System Enums ──────────────────────────────────────────────
    console.log('8️⃣  Seeding system enums...');
    let enumCount = 0;
    for (const e of DEFAULT_ENUMS) {
        const existing = await db.query.systemEnums.findFirst({
            where: (t, { and: a, eq: eq2 }) => a(eq2(t.type, e.type), eq2(t.value, e.value)),
        });
        if (!existing) {
            await db.insert(systemEnums).values(e);
            enumCount++;
        }
    }
    console.log(`   ✅ ${enumCount} system enums created`);

    // ── Step 9: Menu Reset (always) ───────────────────────────────────────
    console.log('9️⃣  Resetting menu permissions...');
    await db.delete(menuPermissions);
    let menuCount = 0;
    for (let i = 0; i < MENU_STRUCTURE.length; i++) {
        const menu = MENU_STRUCTURE[i];
        const [parent] = await db.insert(menuPermissions).values({
            key: menu.key, label: menu.label, labelLao: menu.labelLao, icon: menu.icon,
            path: (menu as any).path || null, requiredPermission: menu.requiredPermission || null,
            order: i, isActive: true,
        }).returning();
        menuCount++;
        if (menu.children?.length) {
            for (let j = 0; j < menu.children.length; j++) {
                const child = menu.children[j];
                await db.insert(menuPermissions).values({
                    key: child.key, label: child.label, labelLao: child.labelLao, icon: child.icon,
                    path: (child as any).path || null, requiredPermission: child.requiredPermission || null,
                    parentId: parent.id, order: j, isActive: true,
                });
                menuCount++;
            }
        }
    }
    console.log(`   ✅ ${menuCount} menu items seeded`);

    // ── Step 10: Demo Branches ────────────────────────────────────────────
    console.log('🔟  Creating demo branches...');
    const demoBranchDefs = [
        { name: 'ສາຂາ 1 - ວຽງຈັນ', code: 'branch1', path: `${hqPath}.branch1` },
        { name: 'ສາຂາ 2 - ຫຼວງພະບາງ', code: 'branch2', path: `${hqPath}.branch2` },
    ];

    const branchIds: Record<string, string> = { hq: hqBranchId };
    const storeIds: Record<string, string> = { hq: hqStoreId };

    for (const def of demoBranchDefs) {
        let branch = await db.query.branches.findFirst({
            where: and(eq(branches.tenantId, tenantId), eq(branches.code, def.code)),
        });
        if (!branch) {
            [branch] = await db.insert(branches).values({
                tenantId, name: def.name, code: def.code, branchPath: def.path,
                parentBranchId: hqBranchId, isMain: false, isActive: true,
            }).returning();
            console.log(`   + Branch: ${def.name}`);
        }
        branchIds[def.code] = branch.id;

        let branchStore = await db.query.stores.findFirst({
            where: eq(stores.branchId, branch.id),
        });
        if (!branchStore) {
            [branchStore] = await db.insert(stores).values({
                tenantId, branchId: branch.id,
                name: `ຮ້ານ ${def.name}`, code: def.code.toUpperCase(),
                isActive: true, isMain: false,
            }).returning();
        }
        storeIds[def.code] = branchStore.id;
    }
    console.log('   ✅ Branches ready');

    // ── Step 11: Demo Users ───────────────────────────────────────────────
    console.log('1️⃣1️⃣  Creating demo users...');
    const hashedPassword = await argon2.hash(DEMO_PASSWORD);

    const allRoles = await db.query.roles.findMany({ where: eq(roles.tenantId, tenantId) });
    const systemRoles = await db.query.roles.findMany({ where: sql`tenant_id IS NULL` });
    const allRolesFlat = [...allRoles, ...systemRoles];
    const roleByName = Object.fromEntries(allRolesFlat.map(r => [r.name, r]));

    const DEMO_USERS = [
        { email: 'tenant@kpos.la', name: 'ທ. ຜູ້ຈັດການ (Tenant Admin)', role: 'admin', branchKey: 'hq' },
        { email: 'hq.admin@kpos.la', name: 'ທ. HQ Admin', role: 'hq_admin', branchKey: 'hq' },
        { email: 'hq.manager@kpos.la', name: 'ທ. HQ Manager', role: 'hq_manager', branchKey: 'hq' },
        { email: 'branch.admin@kpos.la', name: 'ທ. ຜູ້ຈັດການສາຂາ (Branch Admin)', role: 'branch_admin', branchKey: 'branch1' },
        { email: 'branch.manager@kpos.la', name: 'ທ. ຜູ້ຈັດການ (Branch Manager)', role: 'branch_manager', branchKey: 'branch1' },
        { email: 'cashier@kpos.la', name: 'ທ. ພະນັກງານຂາຍ (Cashier)', role: 'cashier', branchKey: 'branch1' },
    ];

    const userIds: Record<string, string> = {};
    for (const u of DEMO_USERS) {
        let user = await db.query.users.findFirst({
            where: and(eq(users.tenantId, tenantId), eq(users.email, u.email)),
        });
        if (!user) {
            const roleRecord = roleByName[u.role];
            const bId = branchIds[u.branchKey];
            const sId = storeIds[u.branchKey];
            [user] = await db.insert(users).values({
                tenantId, email: u.email, password: hashedPassword,
                name: u.name, role: u.role,
                roleId: roleRecord?.id ?? null,
                branchId: bId, isActive: true,
            }).returning();

            const existingLink = await db.query.userStores.findFirst({
                where: and(eq(userStores.userId, user.id), eq(userStores.storeId, sId)),
            });
            if (!existingLink) {
                await db.insert(userStores).values({
                    userId: user.id, storeId: sId, branchId: bId, tenantId,
                });
            }
            console.log(`   + ${u.email} (${u.role})`);
        }
        userIds[u.email] = user.id;
    }

    // Get cashier user id for transactions
    const cashierUser = await db.query.users.findFirst({
        where: and(eq(users.tenantId, tenantId), eq(users.email, 'cashier@kpos.la')),
    });
    const superAdminUser = await db.query.users.findFirst({
        where: eq(users.isSuperAdmin, true),
    });
    const txUserId = cashierUser?.id ?? superAdminUser?.id ?? '';

    console.log('   ✅ Demo users ready');

    // ── Step 12: Categories ───────────────────────────────────────────────
    console.log('1️⃣2️⃣  Seeding categories...');
    const DEMO_CATEGORIES = [
        { name: 'ເຄື່ອງດື່ມ', slug: 'beverages', color: '#3B82F6', icon: 'Droplets' },
        { name: 'ອາຫານ & ຂອງກິນ', slug: 'food', color: '#F59E0B', icon: 'UtensilsCrossed' },
        { name: 'ເອເລັກໂຕຣນິກ', slug: 'electronics', color: '#8B5CF6', icon: 'Zap' },
        { name: 'ເສື້ອຜ້າ', slug: 'clothing', color: '#EC4899', icon: 'Shirt' },
        { name: 'ສຸຂະພາບ & ຄວາມງາມ', slug: 'health', color: '#10B981', icon: 'Heart' },
    ];

    const catIds: Record<string, string> = {};
    for (const cat of DEMO_CATEGORIES) {
        let existing = await db.query.categories.findFirst({
            where: and(eq(categories.tenantId, tenantId), eq(categories.slug, cat.slug)),
        });
        if (!existing) {
            [existing] = await db.insert(categories).values({
                tenantId, branchId: hqBranchId, name: cat.name, slug: cat.slug,
                color: cat.color, icon: cat.icon, isActive: true, sortOrder: DEMO_CATEGORIES.indexOf(cat),
            }).returning();
            console.log(`   + Category: ${cat.name}`);
        }
        catIds[cat.slug] = existing.id;
    }
    console.log('   ✅ Categories ready');

    // ── Step 13: Products ─────────────────────────────────────────────────
    console.log('1️⃣3️⃣  Seeding products...');
    const DEMO_PRODUCTS = [
        { name: 'ນ້ຳດື່ມ 600ml', sku: 'BEV-001', barcode: '8850006001001', cat: 'beverages', price: 3000, cost: 1500, unit: 'ຂວດ', qty: 200, low: 20 },
        { name: 'ນ້ຳໝາກໄມ້ 350ml', sku: 'BEV-002', barcode: '8850006001002', cat: 'beverages', price: 8000, cost: 4000, unit: 'ກະປ໋ອງ', qty: 150, low: 15 },
        { name: 'ກາເຟໂບຣາຄາ', sku: 'BEV-003', barcode: '8850006001003', cat: 'beverages', price: 15000, cost: 7000, unit: 'ກ່ອງ', qty: 80, low: 10 },
        { name: 'ຊາຂຽວ 500ml', sku: 'BEV-004', barcode: '8850006001004', cat: 'beverages', price: 10000, cost: 5000, unit: 'ຂວດ', qty: 120, low: 15 },
        { name: 'ນ້ຳໝາກຕາຫຼິ່ງ', sku: 'BEV-005', barcode: '8850006001005', cat: 'beverages', price: 6000, cost: 3000, unit: 'ຂວດ', qty: 180, low: 20 },
        { name: 'ມັນຝຣັ່ງທອດ', sku: 'FOO-001', barcode: '8850006002001', cat: 'food', price: 5000, cost: 2500, unit: 'ຊອງ', qty: 100, low: 10 },
        { name: 'ເຂົ້າໜຽວໝູ', sku: 'FOO-002', barcode: '8850006002002', cat: 'food', price: 25000, cost: 12000, unit: 'ຈານ', qty: 50, low: 5 },
        { name: 'ຂອງຫວານ (Mixed)', sku: 'FOO-003', barcode: '8850006002003', cat: 'food', price: 3000, cost: 1000, unit: 'ຊອງ', qty: 200, low: 25 },
        { name: 'ສາຍຊາດ USB-C', sku: 'ELE-001', barcode: '8850006003001', cat: 'electronics', price: 45000, cost: 20000, unit: 'ອັນ', qty: 60, low: 5 },
        { name: 'ກ່ອງໂທລະສັບ', sku: 'ELE-002', barcode: '8850006003002', cat: 'electronics', price: 30000, cost: 12000, unit: 'ອັນ', qty: 40, low: 5 },
        { name: 'ສາຍໃຊ້ USB', sku: 'ELE-003', barcode: '8850006003003', cat: 'electronics', price: 25000, cost: 10000, unit: 'ອັນ', qty: 70, low: 8 },
        { name: 'ເສື້ອຍືດ (T-Shirt M)', sku: 'CLO-001', barcode: '8850006004001', cat: 'clothing', price: 80000, cost: 35000, unit: 'ໂຕ', qty: 30, low: 5 },
        { name: 'ໝວກ (Cap)', sku: 'CLO-002', barcode: '8850006004002', cat: 'clothing', price: 60000, cost: 25000, unit: 'ໃບ', qty: 25, low: 5 },
        { name: 'ແຊ່ມໂພ', sku: 'HLT-001', barcode: '8850006005001', cat: 'health', price: 55000, cost: 25000, unit: 'ຂວດ', qty: 45, low: 5 },
        { name: 'ຄຣີມທາໜ້າ', sku: 'HLT-002', barcode: '8850006005002', cat: 'health', price: 120000, cost: 55000, unit: 'ກ່ອງ', qty: 20, low: 3 },
    ];

    const productList: { id: string; price: number; name: string; sku: string }[] = [];
    for (const p of DEMO_PRODUCTS) {
        let existing = await db.query.products.findFirst({
            where: and(eq(products.tenantId, tenantId), eq(products.sku, p.sku)),
        });
        if (!existing) {
            [existing] = await db.insert(products).values({
                tenantId, branchId: hqBranchId, name: p.name, sku: p.sku, barcode: p.barcode,
                categoryId: catIds[p.cat], price: p.price, cost: p.cost, unit: p.unit,
                isActive: true, trackStock: true, lowStockThreshold: p.low, isVat: true, vatRate: 10,
            }).returning();

            const invExists = await db.query.inventory.findFirst({
                where: and(eq(inventory.productId, existing.id), eq(inventory.branchId, hqBranchId)),
            });
            if (!invExists) {
                await db.insert(inventory).values({
                    tenantId, productId: existing.id, branchId: hqBranchId,
                    quantity: p.qty, reservedQuantity: 0,
                });
            }
            console.log(`   + Product: ${p.name} (stock: ${p.qty})`);
        }
        productList.push({ id: existing.id, price: p.price, name: p.name, sku: p.sku });
    }
    console.log('   ✅ Products ready');

    // ── Step 14: Vendors ──────────────────────────────────────────────────
    console.log('1️⃣4️⃣  Seeding vendors...');
    const DEMO_VENDORS = [
        { name: 'ລາວ ບຸຍ ທ. (LBT)', code: 'LBT', email: 'contact@lbt.la', phone: '021-123456' },
        { name: 'ໂລດ ໃຫຍ່ (Big Road)', code: 'BRD', email: 'info@bigroad.la', phone: '021-234567' },
        { name: 'ເຄ ເທຣດ (K Trade)', code: 'KTR', email: 'sales@ktrade.la', phone: '021-345678' },
    ];
    for (const v of DEMO_VENDORS) {
        const exists = await db.query.vendors.findFirst({
            where: and(eq(vendors.tenantId, tenantId), eq(vendors.code, v.code)),
        });
        if (!exists) {
            await db.insert(vendors).values({
                tenantId, branchId: hqBranchId, name: v.name, code: v.code,
                email: v.email, phone: v.phone, isActive: true,
            });
            console.log(`   + Vendor: ${v.name}`);
        }
    }
    console.log('   ✅ Vendors ready');

    // ── Step 15: Membership Tiers + Point Settings ────────────────────────
    console.log('1️⃣5️⃣  Seeding loyalty...');
    const TIERS = [
        { name: 'Bronze', minPoints: 0, pointMultiplier: 1.0, discountPercent: 0, color: '#CD7F32', sortOrder: 0 },
        { name: 'Silver', minPoints: 500, pointMultiplier: 1.5, discountPercent: 3, color: '#C0C0C0', sortOrder: 1 },
        { name: 'Gold', minPoints: 2000, pointMultiplier: 2.0, discountPercent: 5, color: '#FFD700', sortOrder: 2 },
        { name: 'Platinum', minPoints: 5000, pointMultiplier: 3.0, discountPercent: 10, color: '#E5E4E2', sortOrder: 3 },
    ];
    for (const tier of TIERS) {
        const exists = await db.query.membershipTiers.findFirst({
            where: and(eq(membershipTiers.tenantId, tenantId), eq(membershipTiers.name, tier.name)),
        });
        if (!exists) {
            await db.insert(membershipTiers).values({ tenantId, ...tier, isActive: true });
            console.log(`   + Tier: ${tier.name} (min ${tier.minPoints} pts)`);
        }
    }

    const psExists = await db.query.pointSettings.findFirst({
        where: eq(pointSettings.tenantId, tenantId),
    });
    if (!psExists) {
        await db.insert(pointSettings).values({
            tenantId, pointsPerCurrency: 1, minSpendToEarn: 10000,
            redemptionRate: 100, minPointsToRedeem: 100, expiryMonths: 12, isActive: true,
        });
        console.log('   + Point settings created');
    }

    const loyaltySettingExists = await db.query.settings.findFirst({
        where: and(eq(settings.category, 'loyalty'), eq(settings.key, 'program_settings')),
    });
    if (!loyaltySettingExists) {
        await db.insert(settings).values({
            tenantId, category: 'loyalty', key: 'program_settings',
            value: JSON.stringify({
                earnRate: 1, redeemRate: 100, expiryDays: 365,
                welcomeBonus: 100, birthdayBonus: 200, referralBonus: 50,
                isActive: true,
            }),
        });
        console.log('   + Loyalty program settings created');
    }
    console.log('   ✅ Loyalty ready');

    // ── Step 16: Customers ────────────────────────────────────────────────
    console.log('1️⃣6️⃣  Seeding customers...');
    const DEMO_CUSTOMERS = [
        { name: 'ສົມ ທອງ', phone: '020-1234-5678', points: 1500, spent: 1500000 },
        { name: 'ນາງ ດາວ', phone: '020-2345-6789', points: 800, spent: 800000 },
        { name: 'ທ. ໄຊ', phone: '020-3456-7890', points: 3200, spent: 3200000 },
        { name: 'ນາງ ມາ', phone: '020-4567-8901', points: 250, spent: 250000 },
        { name: 'ທ. ຄຳ', phone: '020-5678-9012', points: 5500, spent: 5500000 },
        { name: 'ນາງ ບົວ', phone: '020-6789-0123', points: 120, spent: 120000 },
        { name: 'ທ. ຕ', phone: '020-7890-1234', points: 900, spent: 900000 },
        { name: 'ນາງ ຈັນ', phone: '020-8901-2345', points: 4100, spent: 4100000 },
        { name: 'ທ. ສ', phone: '020-9012-3456', points: 50, spent: 50000 },
        { name: 'ນາງ ລາ', phone: '020-0123-4567', points: 2800, spent: 2800000 },
    ];

    const customerIds: string[] = [];
    let custCreated = 0;
    for (let i = 0; i < DEMO_CUSTOMERS.length; i++) {
        const c = DEMO_CUSTOMERS[i];
        let cust = await db.query.customers.findFirst({
            where: and(eq(customers.tenantId, tenantId), eq(customers.phone, c.phone)),
        });
        if (!cust) {
            [cust] = await db.insert(customers).values({
                tenantId, branchId: hqBranchId, storeId: hqStoreId,
                name: c.name, phone: c.phone,
                memberCode: `KPOS${String(i + 1).padStart(4, '0')}`,
                points: c.points, totalSpent: c.spent, isActive: true,
            }).returning();

            await db.insert(pointsHistory).values([
                { tenantId, customerId: cust.id, points: c.points + 50, type: 'earn', reason: 'ຊື້ສິນຄ້າ', createdBy: txUserId },
                { tenantId, customerId: cust.id, points: -50, type: 'redeem', reason: 'ແລກຂອງລາງວັນ', createdBy: txUserId },
            ]);
            custCreated++;
        }
        customerIds.push(cust.id);
    }
    console.log(`   ✅ ${custCreated} customers created (${DEMO_CUSTOMERS.length - custCreated} already existed)`);

    // ── Step 17: Promotions, Coupons, Discounts ───────────────────────────
    console.log('1️⃣7️⃣  Seeding promotions...');
    const now = new Date();
    const future = new Date(now); future.setDate(future.getDate() + 30);
    const past = new Date(now); past.setDate(past.getDate() - 30);

    const promExists = await db.query.promotions.findFirst({
        where: eq(promotions.tenantId, tenantId),
    });
    if (!promExists) {
        await db.insert(promotions).values([
            {
                tenantId, name: 'ລຸ້ນ 10% ສ່ວນຫຼຸດ', type: 'PERCENTAGE', value: 10,
                startDate: past, endDate: future, isActive: true, priority: 1,
                usageLimit: 500, usageCount: 47,
            },
            {
                tenantId, name: 'ຊື້ 2 ແຖມ 1 (Beverages)', type: 'BUY_X_GET_Y', value: 1,
                conditions: JSON.stringify({ minQuantity: 2 }),
                startDate: past, endDate: future, isActive: true, priority: 2,
                usageLimit: 100, usageCount: 12,
            },
        ]);
        console.log('   + 2 promotions created');
    }

    const couponExists = await db.query.coupons.findFirst({
        where: eq(coupons.tenantId, tenantId),
    });
    if (!couponExists) {
        await db.insert(coupons).values([
            {
                tenantId, code: 'WELCOME10', name: 'ຍິນດີຕ້ອນຮັບ 10%', type: 'percentage',
                value: 10, minPurchase: 50000, startDate: past, endDate: future,
                usageLimit: 100, usageCount: 5, isActive: true,
            },
            {
                tenantId, code: 'SAVE5K', name: 'ລົດ 5,000 ກີບ', type: 'fixed',
                value: 5000, minPurchase: 30000, startDate: past, endDate: future,
                usageLimit: 200, usageCount: 23, isActive: true,
            },
            {
                tenantId, code: 'KPOS2025', name: 'KPOS 2025 Special', type: 'percentage',
                value: 15, minPurchase: 100000, startDate: past, endDate: future,
                usageLimit: 50, usageCount: 12, isActive: true,
            },
        ]);
        console.log('   + 3 coupons created');
    }

    const discountExists = await db.query.discounts.findFirst({
        where: eq(discounts.tenantId, tenantId),
    });
    if (!discountExists) {
        await db.insert(discounts).values([
            {
                tenantId, name: 'Electronics 5%', discountType: 'percentage', discountValue: 5,
                applyTo: 'category', categoryIds: [catIds['electronics']],
                isActive: true, startDate: past, endDate: future, usageCount: 8,
            },
            {
                tenantId, name: 'Weekend Special 8%', discountType: 'percentage', discountValue: 8,
                applyTo: 'all', isActive: true, startDate: past, endDate: future, usageCount: 35,
            },
        ]);
        console.log('   + 2 discounts created');
    }
    console.log('   ✅ Promotions ready');

    // ── Step 18: Cash Register ────────────────────────────────────────────
    console.log('1️⃣8️⃣  Seeding cash register & shift...');
    let cashReg = await db.query.cashRegisters.findFirst({
        where: eq(cashRegisters.branchId, hqBranchId),
    });
    if (!cashReg) {
        [cashReg] = await db.insert(cashRegisters).values({
            tenantId, branchId: hqBranchId, storeId: hqStoreId,
            name: 'POS ຫຼັກ', code: 'POS-01', isActive: true,
        }).returning();
        console.log('   + Cash register created');
    }
    const cashRegId = cashReg.id;

    // ── Step 19: Payment Methods Lookup ──────────────────────────────────
    const pmList = await db.query.paymentMethods.findMany({
        where: eq(paymentMethods.tenantId, tenantId),
    });
    const pmCash = pmList.find(p => p.code === 'CASH') ?? pmList[0];
    const pmCard = pmList.find(p => p.code === 'CARD') ?? pmList[0];
    const pmQr = pmList.find(p => p.code === 'QR') ?? pmList[0];

    // ── Step 20: Demo Transactions ────────────────────────────────────────
    console.log('1️⃣9️⃣  Seeding demo transactions...');
    const existingTxCount = await db.select({ c: sql`count(*)` }).from(transactions)
        .where(eq(transactions.tenantId, tenantId));
    const txCount = Number(existingTxCount[0]?.c ?? 0);

    if (txCount < 10) {
        let totalRevenue = 0;
        for (let i = 0; i < 30; i++) {
            const daysBack = randomInt(0, 29);
            const txDate = daysAgo(daysBack);
            const txNo = `TXN-${txDate.toISOString().slice(0,10).replace(/-/g,'')}-${String(i + 1).padStart(3, '0')}`;

            const itemCount = randomInt(1, 3);
            const pickedProducts: typeof productList = [];
            const shuffled = [...productList].sort(() => Math.random() - 0.5);
            for (let k = 0; k < itemCount; k++) pickedProducts.push(shuffled[k]);

            const lineItems = pickedProducts.map(p => ({
                ...p, quantity: randomInt(1, 4),
                unitPrice: p.price, total: 0,
            }));
            lineItems.forEach(li => { li.total = li.unitPrice * li.quantity; });
            const subtotal = lineItems.reduce((s, li) => s + li.total, 0);
            const taxAmount = Math.round(subtotal * 0.1);
            const total = subtotal + taxAmount;

            const pmRand = randomInt(1, 10);
            const pm = pmRand <= 6 ? pmCash : pmRand <= 9 ? pmCard : pmQr;

            const useCustomer = randomInt(1, 10) <= 3;
            const customerId = useCustomer && customerIds.length > 0 ? pick(customerIds) : null;

            try {
                const txExists = await db.query.transactions.findFirst({
                    where: and(eq(transactions.tenantId, tenantId), eq(transactions.transactionNo, txNo)),
                });
                if (txExists) continue;

                const [tx] = await db.insert(transactions).values({
                    tenantId, transactionNo: txNo, type: 'SALE', status: 'COMPLETED',
                    branchId: hqBranchId, storeId: hqStoreId, userId: txUserId,
                    customerId, orderType: 'WALKIN',
                    subtotal, taxAmount, total,
                    discountValue: 0, discountAmount: 0,
                    received: total, change: 0,
                    pointsEarned: Math.floor(total / 10000),
                    createdAt: txDate, updatedAt: txDate,
                }).returning();

                for (const li of lineItems) {
                    await db.insert(transactionItems).values({
                        tenantId, transactionId: tx.id,
                        productId: li.id, productName: li.name, sku: li.sku,
                        quantity: li.quantity, unitPrice: li.unitPrice, cost: Math.round(li.unitPrice * 0.5),
                        taxRate: 10, taxAmount: Math.round(li.total * 0.1),
                        total: li.total + Math.round(li.total * 0.1),
                    });
                }

                await db.insert(transactionPayments).values({
                    tenantId, transactionId: tx.id,
                    methodId: pm.id, methodName: pm.name, amount: total,
                });

                totalRevenue += total;
            } catch {
                // Skip duplicates
            }
        }

        const shiftExists = await db.query.shifts.findFirst({
            where: eq(shifts.tenantId, tenantId),
        });
        if (!shiftExists) {
            const yesterday = daysAgo(1);
            const shiftEnd = new Date(yesterday); shiftEnd.setHours(22, 0, 0);
            const shiftStart = new Date(yesterday); shiftStart.setHours(8, 0, 0);
            const closingBal = Math.round(totalRevenue * 0.6) + 500000;
            await db.insert(shifts).values({
                tenantId, branchId: hqBranchId, storeId: hqStoreId,
                userId: txUserId, registerId: cashRegId,
                shiftNo: 'SHIFT-001', status: 'CLOSED',
                openedAt: shiftStart, closedAt: shiftEnd,
                openingBalance: 500000, closingBalance: closingBal,
                expectedBalance: closingBal, difference: 0,
            });
            console.log('   + Shift seeded');
        }
        console.log(`   ✅ 30 demo transactions seeded`);
    } else {
        console.log(`   - Transactions exist (${txCount} found)`);
    }

    // ── Done ──────────────────────────────────────────────────────────────
    console.log('\n✅ Demo seed completed!\n');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('📋 All Accounts');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log(`  Level 1  Super Admin      ${SUPER_ADMIN_EMAIL}`);
    console.log(`           Password:        ${SUPER_ADMIN_PASSWORD}`);
    console.log('');
    console.log('  Demo accounts (password: ' + DEMO_PASSWORD + ')');
    console.log(`  Level 2  Tenant Admin     tenant@kpos.la`);
    console.log(`  Level 3  HQ Admin         hq.admin@kpos.la`);
    console.log(`  Level 4  HQ Manager       hq.manager@kpos.la`);
    console.log(`  Level 5  Branch Admin     branch.admin@kpos.la`);
    console.log(`  Level 6  Branch Manager   branch.manager@kpos.la`);
    console.log(`  Level 7  Cashier          cashier@kpos.la`);
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log(`  Tenant:  ${defaultTenant.name} (${defaultTenant.code})`);
    console.log(`  Branch:  ${hqBranch.name} + 2 demo branches`);
    console.log(`  Roles:   ${DEFAULT_ROLES.length}  Rules: ${DEFAULT_RULES.length}  Menu items: ${menuCount}`);
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
}

seedDemo()
    .then(() => { client.end(); process.exit(0); })
    .catch(err => { console.error('❌ Demo seed failed:', err); client.end(); process.exit(1); });
